const fs = require("fs");
const zlib = require("zlib");

const SIG_LFH = 0x04034b50; // [80, 75, 3, 4]
const SIG_DD = 0x08074b50; // [80, 75, 7, 8]
const SIG_CFH = 0x02014b50; // [80, 75, 1, 2]
const SIG_EOCD = 0x06054b50; // [80, 75, 5, 6]
const SIG_ZIP64_EOCD = 0x06064b50; // [80, 75, 6, 6]

const ZIP64_EXTRA_ID = 0x0001;

const MAX_BYTES_READ = 65536;

class UnzipStream {
    zipFileContent = Buffer.alloc(0);
    fileDataMap = new Map();

    zipFilePath;
    inputFD;

    constructor(zipFilePath) {
        this.zipFilePath = zipFilePath;
    }

    readData() {
        let buffer = new Buffer.alloc(MAX_BYTES_READ);
		let numBytes = fs.readSync(this.inputFD, buffer);
		return buffer.subarray(0, numBytes);
    }

    async extractFiles() {
        // Read Central Directory entries to get file information, then read Local File entries to get file content.
        this.readCentralDirectoryEntries();
        await this.readLocalFileEntries();
    }

    readCentralDirectoryEntries() {
        this.inputFD = fs.openSync(this.zipFilePath, "r");

        // Skip all the Local File entries.
        this._searchLong(SIG_CFH);

        let done = false;
        while(!done) {
            let signature = this._readLong();
            switch(signature) {
                case SIG_CFH:
                    let fileData = {};

                    this._processCentralFileHeader(fileData);

                    let zip64Record = getZip64ExtraRecord(fileData.extra)
                    if(zip64Record) {
                        // Use the values in the Zip64 record instead of the Central Directory.
                        fileData.size = getEightValue(zip64Record.subarray(0, 8));
                        fileData.csize = getEightValue(zip64Record.subarray(8, 16));
                        fileData.fileOffset = getEightValue(zip64Record.subarray(16, 24));
                    }

                    this.fileDataMap.set(fileData.name, fileData);

                    break;

                case SIG_EOCD:
                    this._processCentralDirectoryEnd();

                    // This is always the last section of a zip file.
                    done = true;

                    break;

                case SIG_ZIP64_EOCD:
                    this._processCentralDirectoryZip64();
                    break;

                default:
                    throw("Invalid signature: " + signature);
            }
        }

        fs.closeSync(this.inputFD);
    }

    async readLocalFileEntries() {
        this.inputFD = fs.openSync(this.zipFilePath, "r");

        let currentFileData;

        let done = false;
        while(!done) {
            let signature = this._readLong();
            switch(signature) {
                case SIG_LFH:
                    currentFileData = {};
                    this._processLocalFileHeader(currentFileData);

                    let zip64Record = getZip64ExtraRecord(currentFileData.extra)
                    if(zip64Record) {
                        // Use the values in the Zip64 record instead of the Central Directory.
                        currentFileData.size = getEightValue(zip64Record.subarray(0, 8));
                        currentFileData.csize = getEightValue(zip64Record.subarray(8, 16));
                        currentFileData.fileOffset = getEightValue(zip64Record.subarray(16, 24));
                    }

                    // If fileData is in the map, than the data in the Local File entry is not needed.
                    // If fileData is not in the map, we do not need any of this data but we still must process it.
                    if(this.fileDataMap.has(currentFileData.name)) {
                        currentFileData = this.fileDataMap.get(currentFileData.name);
                    }
                    await this._processLocalFileContent(currentFileData);
                    
                    break;

                case SIG_DD:
                    this._processDataDescriptor(currentFileData);
                    break;

                case SIG_CFH:
                    // At this point we have read all the Local File entries.
                    done = true;
                    break;

                default:
                    throw("Invalid signature: " + signature);
            }
        }

        fs.closeSync(this.inputFD);
    }

    _processLocalFileHeader(fileData) {
        // version to extract and general bit flag
        this._readShort();
        this._readShort();

        // compression method
        this._readShort();

        // datetime
        fileData.time = this._readLong();

        // crc32 checksum and sizes
        fileData.crc = this._readLong();
        fileData.csize = BigInt(this._readLong());
        fileData.size = BigInt(this._readLong());

        // name length
        let nameLength = this._readShort();

        // extra length
        let extraLength = this._readShort();

        // name
        fileData.name = this._readString(nameLength);

        // extra
        fileData.extra = this._readBytes(extraLength);
    }

    _processLocalFileContent(fileData) {
        // Decompress the file content.
        return new Promise((resolve) => {
            fileData.uncompressedFileContent = Buffer.alloc(0);

            let decompressStream = zlib.createInflateRaw();
            decompressStream.on("data", (chunk) => {
                if(chunk) {
                    fileData.uncompressedFileContent = Buffer.concat([fileData.uncompressedFileContent, chunk]);
                }
            });

            decompressStream.on("end", () => {
                resolve();
            });

            if(fileData.csize > 0) {
                // We know exactly how many bytes to read. Note that "csize" is a BigInt.
                let numBytes = fileData.csize;

                while(numBytes > MAX_BYTES_READ) {
                    numBytes -= MAX_BYTES_READ;
                    decompressStream.write(this._readBytes(MAX_BYTES_READ));
                }

                // At this point, we know "numBytes" is small enough to safely convert into a Number.
                decompressStream.write(this._readBytes(Number(numBytes)));
            }
            else {
                // We don't know how far to read, so keep going until we see the next Data Descriptor signature.
                // This case will only happen if there is a Data Descriptor for this file.
                this._searchLong(SIG_DD, (chunk) => {
                    decompressStream.write(chunk);
                });
            }

            decompressStream.end();
        });
    }

    _processDataDescriptor(fileData) {
        // crc32 checksum
        fileData.crc = this._readLong();

        // sizes
        if(getZip64ExtraRecord(fileData.extra)) {
            fileData.csize = this._readEight();
            fileData.size = this._readEight();
        }
        else {
            fileData.csize = BigInt(this._readLong());
            fileData.size = BigInt(this._readLong());
        }
    }

    _processCentralFileHeader(fileData) {
        // version made by
        this._readShort();
      
        // version to extract and general bit flag
        this._readShort();
        this._readShort();
      
        // compression method
        this._readShort();
      
        // datetime
        fileData.time = this._readLong();
      
        // crc32 checksum
        fileData.crc = this._readLong();
      
        // sizes
        fileData.csize = this._readLong();
        fileData.size = this._readLong();
      
        // name length
        let nameLength = this._readShort();
      
        // extra length
        let extraLength = this._readShort();
      
        // comments length
        let commentLength = this._readShort();
      
        // disk number start
        this._readShort();
      
        // internal attributes
        fileData.internalAttributes = this._readShort();
      
        // external attributes
        fileData.externalAttributes = this._readLong();
      
        // relative offset of LFH
        fileData.fileOffset = BigInt(this._readLong());
      
        // name
        fileData.name = this._readString(nameLength);
      
        // extra
        fileData.extra = this._readBytes(extraLength);
      
        // comment
        fileData.comment = this._readString(commentLength);
    }

    _processCentralDirectoryZip64() {
        // size of the ZIP64 EOCD record
        this._readEight();
      
        // version made by
        this._readShort();
      
        // version to extract
        this._readShort();
      
        // disk numbers
        this._readLong();
        this._readLong();
      
        // number of entries
        this._readEight();
        this._readEight();
      
        // length and location of CD
        this._readEight();
        this._readEight();
      
        // end of central directory locator
        this._readLong();
      
        // disk number holding the ZIP64 EOCD record
        this._readLong();
      
        // relative offset of the ZIP64 EOCD record
        this._readEight();
      
        // total number of disks
        this._readLong();
    }

    _processCentralDirectoryEnd() {
        // disk numbers
        this._readShort();
        this._readShort();
      
        // number of entries
        this._readShort();
        this._readShort();
      
        // length and location of CD
        this._readLong();
        this._readLong();
      
        // archive comment
        let archiveCommentLength = this._readShort();
        this._readString(archiveCommentLength);
    }

    _readShort() {
        let bytes = this._readBytes(2);
        return getShortValue(bytes);
    };

    _readLong() {
        let bytes = this._readBytes(4);
        return getLongValue(bytes);
    };

    _readEight() {
        let bytes = this._readBytes(8);
        return getEightValue(bytes);
    };

    _readString(strLength) {
        let bytes = this._readBytes(strLength);
        return bytes.toString();
    };

    _readBytes(n) {
        // Return and consume n bytes from zipFileContent.
        let bytes = this._peekBytes(n);
        this.zipFileContent = this.zipFileContent.subarray(n);
        return bytes;
    };

    _peekBytes(n) {
        // Return n bytes from zipFileContent.
        while(this.zipFileContent.length < n) {
            // Read more bytes first.
            let newBytes = this.readData();
            if(newBytes.length === 0) {
                break;
            }
            this.zipFileContent = Buffer.concat([this.zipFileContent, newBytes]);
        }

        let bytes = this.zipFileContent.subarray(0, n);
        return bytes;
    };

    _searchLong(v, callback) {
        // Consume bytes from zipFileContent, stopping when the value "v" is found or there is no more data left.
        // If a callback is provided, the consumed bytes will be passed in. 
        let data = Buffer.alloc(0);
        while(this._peekLong() !== v) {
            data = Buffer.concat([data, this._readBytes(1)]);

            if(data.length === MAX_BYTES_READ) {
                if(callback) {
                    callback(data);
                }
                data = Buffer.alloc(0);
            }
        }

        if(callback) {
            callback(data);
        }

        return;
    }

    _peekLong() {
        let bytes = this._peekBytes(4);
        return getLongValue(bytes);
    };
}

function getZip64ExtraRecord(extra) {
    // Look for an extra record indicating the Zip64 format was used.
    while(extra.length > 0) {
        let id = getShortValue(readBytes(2));
        let recordLength = getShortValue(readBytes(2));
        let zip64Record = readBytes(recordLength);
        if(id === ZIP64_EXTRA_ID) {
            return zip64Record;
        }
    }

    return undefined;

    function readBytes(n) {
        // Return and consume n bytes from extra.
        let bytes = extra.subarray(0, n);
        extra = extra.subarray(n);
        return bytes;
    };
};

function getShortValue(bytes) {
    return bytes.readUInt16LE();
};

function getLongValue(bytes) {
    return bytes.readUInt32LE();
};

function getEightValue(bytes) {
    return bytes.readBigUInt64LE();
};

module.exports = UnzipStream;