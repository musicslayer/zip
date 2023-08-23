const fs = require("fs");
const zlib = require("zlib");

const SIG_CFH = 0x02014b50;
const SIG_CFH_BYTES = [80, 75, 1, 2];

const ZIP64_EXTRA_ID = 0x0001;

const MAX_BYTES_READ = 65536;

class UnzipStream {
    fileDataMap = new Map();

    zipFilePath;
    inputFD;
    offset;
    zipFileContent;

    constructor(zipFilePath) {
        this.zipFilePath = zipFilePath;
    }

    openFile(initialOffset) {
        this.inputFD = fs.openSync(this.zipFilePath, "r");
        this.offset = initialOffset;
        this.zipFileContent = Buffer.alloc(0);
    }

    closeFile() {
        fs.closeSync(this.inputFD);
    }

    readData() {
        let buffer = new Buffer.alloc(MAX_BYTES_READ);
		let numBytes = fs.readSync(this.inputFD, buffer, {position: this.offset});
        this.offset += BigInt(numBytes);
		return buffer.subarray(0, numBytes);
    }

    searchData(data) {
        // Returns the offset of "data" in the file.
        let offset;

        let searchBytes = Buffer.from(data);
        let searchBoundaryLength = searchBytes.length - 1;
        let currentOffset = 0n;
        
        this.openFile(0n);

        while(true) {
            let fileData = this.readData();
            let numBytesRead = fileData.length;
            let numNewBytesRead = numBytesRead - searchBoundaryLength;
            if(numNewBytesRead === 0) {
                offset = -1;
                break;
            }

            let index = fileData.indexOf(searchBytes);
            if(index !== -1) {
                offset = currentOffset + BigInt(index);
                break;
            }

            // To find values across read boundaries, we will read the ending bytes again with the next data.
            currentOffset += BigInt(numNewBytesRead);
        }

        this.closeFile();
        return offset;
    }

    async extractFiles() {
        // Read Central Directory entries to get file information, then read Local File entries to get file content.
        this.readCentralDirectoryEntries();
        await this.readLocalFileEntries();
    }

    readCentralDirectoryEntries() {
        // Jump to the first Central File header.
        let centralFileHeaderOffset = this.searchData(SIG_CFH_BYTES);
        this.openFile(centralFileHeaderOffset);

        while(this._readLong() === SIG_CFH) {
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
        }

        this.closeFile();
    }

    async readLocalFileEntries() {
        for(let fileData of this.fileDataMap.values()) {
            // For each "fileData" in the map, jump to its position in the zip file and look for the File Contents.
            this.openFile(fileData.fileOffset);

            this._processLocalFileHeader();
            await this._processLocalFileContent(fileData);

            this.closeFile();
        }
    }

    _processLocalFileHeader() {
        // signature
        this._readLong();

        // version to extract and general bit flag
        this._readShort();
        this._readShort();

        // compression method
        this._readShort();

        // datetime
        this._readLong();

        // crc32 checksum, compressed size, and uncompressed size
        this._readLong();
        this._readLong();
        this._readLong();

        // name length
        let nameLength = this._readShort();

        // extra length
        let extraLength = this._readShort();

        // name
        this._readString(nameLength);

        // extra
        this._readBytes(extraLength);
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

            // Note that "csize" is a BigInt and may be large, so we may not be able to process everything at once.
            let numBytes = fileData.csize;

            while(numBytes > MAX_BYTES_READ) {
                numBytes -= MAX_BYTES_READ;
                decompressStream.write(this._readBytes(MAX_BYTES_READ));
            }

            // At this point, we know "numBytes" is small enough to safely convert into a Number.
            decompressStream.write(this._readBytes(Number(numBytes)));

            decompressStream.end();
        });
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
      
        // compressed size and uncompressed size
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

    _readShort() {
        let bytes = this._readBytes(2);
        return getShortValue(bytes);
    };

    _readLong() {
        let bytes = this._readBytes(4);
        return getLongValue(bytes);
    };

    _readString(strLength) {
        let bytes = this._readBytes(strLength);
        return getStringValue(bytes);
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

function getStringValue(bytes) {
    return bytes.toString();
};

module.exports = UnzipStream;