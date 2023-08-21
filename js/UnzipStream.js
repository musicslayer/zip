const fs = require("fs");
const zlib = require("zlib");

const SIG_LFH = 0x04034b50;
const SIG_DD = 0x08074b50;
const SIG_CFH = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_EOCD = 0x06064B50;

const ZIP64_EXTRA_ID = 0x0001;

class UnzipStream {
    inputStream;

    fileDataMap = new Map();

    ////
    zipFileContent;
    zipFileLocalContent;

    constructor(zipFilePath) {
        this.inputStream = fs.createReadStream(zipFilePath, "binary");
        this.zipFileContent = fs.readFileSync(zipFilePath);
        this.zipFileLocalContent = Buffer.alloc(0);
    }

    async extractFiles() {
        // Read Central Directory entries to get file information, then read Local File entries to get file content.
        this.readCentralDirectoryEntries();
        this.zipFileContent = this.zipFileLocalContent;
        await this.readLocalFileEntries();
    }

    readCentralDirectoryEntries() {
        // Skip all the Local File entries.
        while(this._peekLong() !== SIG_CFH) {
            this.zipFileLocalContent = Buffer.concat([this.zipFileLocalContent, this._readBytes(1)]);
        }

        while(this.zipFileContent.length > 0) {
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
                    break;

                case SIG_ZIP64_EOCD:
                    this._processCentralDirectoryZip64();
                    break;

                default:
                    throw("Invalid signature: " + signature);
            }
        }
    }

    async readLocalFileEntries() {
        while(this.zipFileContent.length > 0) {
            let signature = this._readLong();
            switch(signature) {
                case SIG_LFH:
                    let name = this._processLocalFileHeader();
                    let fileData = this.fileDataMap.get(name) ?? {};

                    // If fileData was not in the map, that means any values that would be stored on fileData are unwanted.
                    await this._processLocalFileContent(fileData);
                    this._processDataDescriptor(fileData);
                    
                    break;

                default:
                    throw("Invalid signature: " + signature);
            }
        }
    }

    _processLocalFileHeader() {
        // version to extract and general bit flag
        this._readShort();
        this._readShort();

        // compression method
        this._readShort();

        // datetime
        this._readLong();

        // crc32 checksum and sizes
        this._readLong();
        this._readLong();
        this._readLong();

        // name length
        let nameLength = this._readShort();

        // extra length
        let extraLength = this._readShort();

        // name
        let name = this._readString(nameLength);

        // extra
        this._readBytes(extraLength);

        return name;
    }

    _processLocalFileContent(fileData) {
        // Decompress the file content, which keeps going until we see the next Data Descriptor signature.
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

            while(this._peekLong() !== SIG_DD) {
                decompressStream.write(this._readBytes(1));
            }

            decompressStream.end();
        });
    }

    _processDataDescriptor(fileData) {
        // signature
        this._readLong();

        // crc32 checksum
        fileData.crc = this._readLong();

        // sizes
        if(getZip64ExtraRecord(fileData.extra)) {
            fileData.csize = this._readEight();
            fileData.size = this._readEight();
        }
        else {
            fileData.csize = this._readLong();
            fileData.size = this._readLong();
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
        fileData.fileOffset = this._readLong();
      
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

    _peekLong() {
        let bytes = this._peekBytes(4);
        return getLongValue(bytes);
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
        return "" + bytes;
    };





    _peekBytes(n) {
        // Return n bytes from zipFileContent.
        let bytes = this.zipFileContent.subarray(0, n);
        return bytes;
    };

    _readBytes(n) {
        // Return and consume n bytes from zipFileContent.
        let bytes = this.zipFileContent.subarray(0, n);
        this.zipFileContent = this.zipFileContent.subarray(n);
        return bytes;
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