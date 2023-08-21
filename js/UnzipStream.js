const fs = require("fs");
const path = require("path");
const stream = require("stream");
const zlib = require("zlib");

const SIG_LFH = 0x04034b50;
const SIG_DD = 0x08074b50;
const SIG_CFH = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_EOCD = 0x06064B50;
const SIG_ZIP64_EOCD_LOC = 0x07064B50;

const ZIP64_MAGIC_SHORT = 0xffff;
const ZIP64_MAGIC = 0xffffffff;
const ZIP64_EXTRA_ID = 0x0001;

class UnzipStream {
    fileDataArray = [];
    offset = 0;

    inputStream;
    compressionLevel;
    destFolder;

    ////
    zipFileContent;

    constructor(zipFilePath, compressionLevel, destFolder) {
        this.inputStream = fs.createReadStream(zipFilePath, "binary");
        this.compressionLevel = compressionLevel;
        this.destFolder = destFolder;
        this.zipFileContent = fs.readFileSync(zipFilePath);
    }

    async extractFiles() {
        let done = false;
        let fileData = {};

        while(!done) {
            let signature = this._readLong();
            switch(signature) {
                case SIG_LFH:
                    console.log("SIG_LFH");
                    this._processLocalFileHeader(fileData);
                    let uncompressedFileContent = await this._processLocalFileContent(fileData);
                    break;

                case SIG_DD:
                    console.log("SIG_DD");
                    this._processDataDescriptor();

                    // Finish processing the fileData and then reset it.
                    this._processFileData(fileData);
                    fileData = {};
                    break;

                case SIG_CFH:
                    // At this point we can stop processing the file.
                    console.log("SIG_CFH");
                    done = true;
                    break;

                default:
                    throw("Invalid character: " + theCharValue);
            }
        }
    }

    _processLocalFileHeader(fileData) {
        // version to extract and general bit flag
        let version = this._readShort();
        let generalBitFlag = this._readShort();

        // compression method
        let compressionMethod = this._readShort();

        // datetime
        let time = this._readLong();

        // crc32 checksum and sizes
        let crc = this._readLong();
        let csize = this._readLong();
        let size = this._readLong();

        // name length
        let nameLength = this._readShort();

        // extra length
        let extraLength = this._readShort();

        // name
        fileData.name = this._readString(nameLength);

        // extra
        fileData.extra = this._readString(extraLength);
    }

    _processLocalFileContent(fileData) {
        // Decompress the file content and create a new file object.
        // In general, the file content keeps going until we see the Data Descriptor signature.
        return new Promise((resolve) => {
            let found = false;
            let fileContent = Buffer.alloc(0);
            while(this.zipFileContent.length > 8) {
                if(this._peekLong() === SIG_DD) {
                    found = true;
                    break;
                }
                else {
                    fileContent = Buffer.concat([fileContent, this._readBytes(1)]);
                }
            }

            fileData.uncompressedFileContent = Buffer.alloc(0);

            let decompressStream = zlib.createInflateRaw({ level: this.compressionLevel });
            decompressStream.on("data", (chunk) => {
                if(chunk) {
                    fileData.uncompressedFileContent = Buffer.concat([fileData.uncompressedFileContent, chunk]);
                }
            });

            decompressStream.on("end", () => {
                resolve();
            });

            decompressStream.write(fileContent);
            decompressStream.end();
        });
    }

    _processDataDescriptor() {
        // version to extract and general bit flag
        let crc = this._readLong();
        let csize;
        let size;

        let isFileZip64 = false; /////

        if(isFileZip64) {
            csize = this._readEight();
            size = this._readEight();
        }
        else {
            csize = this._readLong();
            size = this._readLong();
        }
    }



    _processFileData(fileData) {
        console.log(fileData);

        let destPath = path.join(this.destFolder, fileData.name);
        console.log(destPath);

        // Create any neccessary folders and then write the file content.
        let fileParts = destPath.split(path.sep);
        let fileFolder = path.join(...fileParts.slice(0, -1));
        fs.mkdirSync(fileFolder, { recursive: true });

        fs.writeFileSync(destPath, fileData.uncompressedFileContent);
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