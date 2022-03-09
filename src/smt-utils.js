const { Scalar } = require('ffjavascript');

const constants = require('./constants');
const getPoseidon = require('./poseidon');

/**
 * Converts a Scalar into an array of 8 elements encoded as Fields elements where each one represents 32 bits
 * result = [Scalar[0:31], scalar[32:63], scalar[64:95], scalar[96:127], scalar[128:159], scalar[160:191], scalar[192:224], scalar[224:255]]
 * @param {Field} Fr - field
 * @param {Scalar} scalar - value to convert
 * @returns {Array[Field]} array of fields
 */
function scalar2fea(Fr, scalar) {
    scalar = Scalar.e(scalar);
    const r0 = Scalar.band(scalar, Scalar.e('0xFFFFFFFF'));
    const r1 = Scalar.band(Scalar.shr(scalar, 32), Scalar.e('0xFFFFFFFF'));
    const r2 = Scalar.band(Scalar.shr(scalar, 64), Scalar.e('0xFFFFFFFF'));
    const r3 = Scalar.band(Scalar.shr(scalar, 96), Scalar.e('0xFFFFFFFF'));
    const r4 = Scalar.band(Scalar.shr(scalar, 128), Scalar.e('0xFFFFFFFF'));
    const r5 = Scalar.band(Scalar.shr(scalar, 160), Scalar.e('0xFFFFFFFF'));
    const r6 = Scalar.band(Scalar.shr(scalar, 192), Scalar.e('0xFFFFFFFF'));
    const r7 = Scalar.band(Scalar.shr(scalar, 224), Scalar.e('0xFFFFFFFF'));

    return [Fr.e(r0), Fr.e(r1), Fr.e(r2), Fr.e(r3), Fr.e(r4), Fr.e(r5), Fr.e(r6), Fr.e(r7)];
}

/**
 * Field elemetn array to Scalar
 * result = arr[0] + arr[1]*(2^32) + arr[2]*(2^64) + arr[3]*(2^96) + arr[3]*(2^128) + arr[3]*(2^160) + arr[3]*(2^192) + arr[3]*(2^224)
 * @param {Field} F - field element
 * @param {Array[Field]} arr - array of fields elements
 * @returns {Scalar}
 */
function fea2scalar(Fr, arr) {
    let res = Fr.toObject(arr[0]);
    res = Scalar.add(res, Scalar.shl(Fr.toObject(arr[1]), 32));
    res = Scalar.add(res, Scalar.shl(Fr.toObject(arr[2]), 64));
    res = Scalar.add(res, Scalar.shl(Fr.toObject(arr[3]), 96));
    res = Scalar.add(res, Scalar.shl(Fr.toObject(arr[4]), 128));
    res = Scalar.add(res, Scalar.shl(Fr.toObject(arr[5]), 160));
    res = Scalar.add(res, Scalar.shl(Fr.toObject(arr[6]), 192));
    res = Scalar.add(res, Scalar.shl(Fr.toObject(arr[7]), 224));

    return res;
}

/**
 * Field element to 32bit number
 * @param {Field} Fr - field element
 * @param {Field} fe - field to convert
 * @returns {Number}
 */
function fe2n(Fr, fe) {
    const maxInt = Scalar.e('0x7FFFFFFF');
    const minInt = Scalar.sub(Fr.p, Scalar.e('0x80000000'));
    const o = Fr.toObject(fe);
    if (Scalar.gt(o, maxInt)) {
        const on = Scalar.sub(Fr.p, o);
        if (Scalar.gt(o, minInt)) {
            return -Scalar.toNumber(on);
        }
        throw new Error('Accessing a no 32bit value');
    } else {
        return Scalar.toNumber(o);
    }
}

/**
 * Convert array of 4 Scalars of 64 bits into a unique 256 bits scalar
 * @param {Array[Scalar]} h4 - Array of 4 Scalars of 64 bits
 * @returns {Scalar} 256 bit number representation
 */
function h4toScalar(h4) {
    return Scalar.add(
        Scalar.add(
            h4[0],
            Scalar.shl(h4[1], 64),
        ),
        Scalar.add(
            Scalar.shl(h4[2], 128),
            Scalar.shl(h4[3], 192),
        ),
    );
}

/**
 * Convert array of 4 Scalars of 64 bits into an hex string
 * @param {Array[Scalar]} h4 - Array of 4 Scalars of 64 bits
 * @returns {String} 256 bit number represented as hex string
 */
function h4toString(h4) {
    const sc = h4toScalar(h4);

    return `0x${Scalar.toString(sc, 16).padStart(64, '0')}`;
}

/**
 * Convert string into an array of scalars
 * @param {String} s - 256 bit number represented as hex string
 * @returns {Array} - Array of Scalars of 64 bits
 */
function stringToH4(s) {
    if (s.slice(0, 2) !== '0x') throw new Error('Hexadecimal required');
    if (s.length !== 66) throw new Error('Hexadecimal all digits required');

    const res = [];

    res[3] = Scalar.e(`0x${s.slice(2, 18)}`);
    res[2] = Scalar.e(`0x${s.slice(18, 34)}`);
    res[1] = Scalar.e(`0x${s.slice(34, 50)}`);
    res[0] = Scalar.e(`0x${s.slice(50)}`);

    return res;
}

/**
 * Leaf type 0:
 *   hk0: H([ethAddr[0:4], ethAddr[4:8], ethAddr[8:12], ethAddr[12:16], ethAddr[16:20], 0, 0, 0])
 *   hk1: H([0, 0, 0, 0, 0, 0, 0, 0])
 *   key = H([...hk0, ...hk1])
 * @param {String | Scalar} _ethAddr - ethereum address represented as hexadecimal string
 * @returns {Scalar} - key computed
 */
async function keyEthAddrBalance(_ethAddr) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const constant = F.e(constants.SMT_KEY_BALANCE);

    let ethAddr;
    if (typeof _ethAddr === 'string') {
        ethAddr = Scalar.fromString(_ethAddr, 16);
    } else {
        ethAddr = Scalar.e(_ethAddr);
    }

    const ethAddrArr = scalar2fea(F, ethAddr);

    const key0 = [ethAddrArr[0], ethAddrArr[1], ethAddrArr[2], ethAddrArr[3], ethAddrArr[4], ethAddrArr[5], constant, F.zero];
    const key1 = [F.zero, F.zero, F.zero, F.zero, F.zero, F.zero, F.zero, F.zero];

    const hk0 = poseidon(key0);
    const hk1 = poseidon(key1);

    return h4toScalar(poseidon([...hk0, ...hk1]));
}

/**
 * Leaf type 1:
 *   hk0: H([ethAddr[0:4], ethAddr[4:8], ethAddr[8:12], ethAddr[12:16], ethAddr[16:20], 0, 1, 0])
 *   hk1: H([0, 0, 0, 0, 0, 0, 0, 0])
 *   key = H([...hk0, ...hk1])
 * @param {String | Scalar} _ethAddr - ethereum address represented as hexadecimal string
 * @returns {Scalar} - key computed
 */
async function keyEthAddrNonce(_ethAddr) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const constant = F.e(constants.SMT_KEY_NONCE);

    let ethAddr;
    if (typeof _ethAddr === 'string') {
        ethAddr = Scalar.fromString(_ethAddr, 16);
    } else {
        ethAddr = Scalar.e(_ethAddr);
    }

    const ethAddrArr = scalar2fea(F, ethAddr);

    const key0 = [ethAddrArr[0], ethAddrArr[1], ethAddrArr[2], ethAddrArr[3], ethAddrArr[4], ethAddrArr[5], constant, F.zero];
    const key1 = [F.zero, F.zero, F.zero, F.zero, F.zero, F.zero, F.zero, F.zero];

    const hk0 = poseidon(key0);
    const hk1 = poseidon(key1);

    return h4toScalar(poseidon([...hk0, ...hk1]));
}

/**
 * Leaf type 1:
 *   hk0: H([ethAddr[0:4], ethAddr[4:8], ethAddr[8:12], ethAddr[12:16], ethAddr[16:20], 0, 2, 0])
 *   hk1: H([0, 0, 0, 0, 0, 0, 0, 0])
 *   key = H([...hk0, ...hk1])
 * @param {String | Scalar} _ethAddr - ethereum address represented as hexadecimal string
 * @returns {Scalar} - key computed
 */
async function keyContractCode(_ethAddr) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const constant = F.e(constants.SMT_KEY_SC_CODE);

    let ethAddr;
    if (typeof _ethAddr === 'string') {
        ethAddr = Scalar.fromString(_ethAddr, 16);
    } else {
        ethAddr = Scalar.e(_ethAddr);
    }

    const ethAddrArr = scalar2fea(F, ethAddr);

    const key0 = [ethAddrArr[0], ethAddrArr[1], ethAddrArr[2], ethAddrArr[3], ethAddrArr[4], ethAddrArr[5], constant, F.zero];
    const key1 = [F.zero, F.zero, F.zero, F.zero, F.zero, F.zero, F.zero, F.zero];

    const hk0 = poseidon(key0);
    const hk1 = poseidon(key1);

    return h4toScalar(poseidon([...hk0, ...hk1]));
}

/**
 * Leaf type 3:
 *   hk0: H([ethAddr[0:4], ethAddr[4:8], ethAddr[8:12], ethAddr[12:16], ethAddr[16:20], 0, 3, 0])
 *   hk1: H([stoPos[0:4], stoPos[4:8], stoPos[8:12], stoPos[12:16], stoPos[16:20], stoPos[20:24], stoPos[24:28], stoPos[28:32])
 *   key = H([...hk0, ...hk1])
 * @param {String | Scalar} _ethAddr - ethereum address represented as hexadecimal string
 * @param {Number | Scalar} _storagePos - smart contract storage position
 * @returns {Scalar} - key computed
 */
async function keyContractStorage(_ethAddr, _storagePos) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const constant = F.e(constants.SMT_KEY_SC_STORAGE);

    let ethAddr;
    if (typeof _ethAddr === 'string') {
        ethAddr = Scalar.fromString(_ethAddr, 16);
    } else {
        ethAddr = Scalar.e(_ethAddr);
    }

    const ethAddrArr = scalar2fea(F, ethAddr);

    const storagePos = Scalar.e(_storagePos);
    const storagePosArray = scalar2fea(F, storagePos);

    const key0 = [ethAddrArr[0], ethAddrArr[1], ethAddrArr[2], ethAddrArr[3], ethAddrArr[4], ethAddrArr[5], constant, F.zero];

    const hk0 = poseidon(key0);
    const hk1 = poseidon(storagePosArray);

    return h4toScalar(poseidon([...hk0, ...hk1]));
}

/**
 * Fill the dbObject with all the childs recursively
 * @param {Array[Field]} node merkle node
 * @param {Object} db Mem DB
 * @param {Object} dbObject Object that will be fullfilled
 * @param {Object} Fr - poseidon F
 * @returns {Array} merkle tree
 */
async function fillDBArray(node, db, dbObject, Fr) {
    const childArray = await db.getSmtNode(node);
    const childArrayHex = childArray.map((value) => Fr.toString(value, 16).padStart(16, '0'));
    const nodeHex = Scalar.toString(h4toString(node), 16);

    dbObject[nodeHex] = childArrayHex;

    if (Scalar.fromString(childArrayHex[0], 16) !== Scalar.e(1)) {
        for (let i = 0; i < childArray.length; i += 4) {
            if (!(Fr.isZero(childArray[i]) && Fr.isZero(childArray[i + 1])
                  && Fr.isZero(childArray[i + 2]) && Fr.isZero(childArray[i + 3]))) {
                await fillDBArray(
                    [childArray[i],
                        childArray[i + 1],
                        childArray[i + 2],
                        childArray[i + 3]],
                    db,
                    dbObject,
                    Fr,
                );
            }
        }
    } else { // final node: Hvalue --> key prime | value
        const nodeFinal = [childArray[4], childArray[5], childArray[6], childArray[7]];
        const hashV = await db.getSmtNode(nodeFinal);
        const hashVHex = hashV.map((value) => Fr.toString(value, 16).padStart(16, '0'));
        const nodeFinalHex = Scalar.toString(h4toString(nodeFinal), 16);

        dbObject[nodeFinalHex] = hashVHex;

        // keyPrime
        const nodeKeyPrime = [hashV[0], hashV[1], hashV[2], hashV[3]];
        const valueKeyPrime = await db.getSmtNode(nodeKeyPrime);
        const valueKeyPrimeHex = valueKeyPrime.map((value) => Fr.toString(value, 16).padStart(16, '0'));
        const nodeKeyPrimeHex = Scalar.toString(h4toString(nodeKeyPrime), 16);

        dbObject[nodeKeyPrimeHex] = valueKeyPrimeHex;

        // Value
        const nodeValue = [hashV[4], hashV[5], hashV[6], hashV[7]];
        const valueFinal = await db.getSmtNode(nodeValue);
        const valueHex = valueFinal.map((value) => Fr.toString(value, 16).padStart(16, '0'));
        const nodeValueHex = Scalar.toString(h4toString(nodeValue), 16);

        dbObject[nodeValueHex] = valueHex;
    }
}

/**
 * Return all merkle tree nodes and leafs in an Object
 * @param {Array[Scalar]} root merkle root
 * @param {Object} db Mem DB
 * @param {Object} Fr - poseidon F
 * @returns {Object} merkle tree
 */
async function getCurrentDB(root, db, Fr) {
    const dbObject = {};
    if (Fr.isZero(root[0])
        && Fr.isZero(root[1])
        && Fr.isZero(root[2])
        && Fr.isZero(root[3])
    ) {
        return null;
    }
    await fillDBArray(root, db, dbObject, Fr);

    return dbObject;
}

/**
 * Computes the bytecode hash in order to add it to the state-tree
 * @param {String} bytecode - smart contract bytecode represented as hex string
 * @returns {String} bytecode hash represented as hex string
 */
async function hashContractBytecode(_bytecode) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const bytecode = _bytecode.startsWith('0x') ? _bytecode.slice(2) : _bytecode;

    const numBytes = bytecode.length / 2;

    const numHashes = Math.ceil(numBytes / (constants.BYTECODE_ELEMENTS_HASH * constants.BYTECODE_BYTES_ELEMENT));

    let tmpHash;
    let bytesPointer = 0;

    for (let i = 0; i < numHashes; i++) {
        const maxBytesToAdd = constants.BYTECODE_ELEMENTS_HASH * constants.BYTECODE_BYTES_ELEMENT;
        const elementsToHash = [];

        if (i !== 0) {
            elementsToHash.push(...tmpHash);
        } else {
            elementsToHash.push(F.zero);
            elementsToHash.push(F.zero);
            elementsToHash.push(F.zero);
            elementsToHash.push(F.zero);
        }

        const subsetBytecode = bytecode.slice(bytesPointer, bytesPointer + maxBytesToAdd * 2);
        bytesPointer += maxBytesToAdd * 2;

        let tmpElem = '';
        let counter = 0;

        for (let j = 0; j < maxBytesToAdd; j++) {
            let byteToAdd = '00';
            if (j < subsetBytecode.length / 2) {
                byteToAdd = subsetBytecode.slice(j * 2, (j + 1) * 2);
            }

            tmpElem = tmpElem.concat(byteToAdd);
            counter += 1;

            if (counter === constants.BYTECODE_BYTES_ELEMENT) {
                elementsToHash.push(F.e(Scalar.fromString(tmpElem, 16)));
                tmpElem = '';
                counter = 0;
            }
        }

        tmpHash = poseidon(elementsToHash);
    }

    return h4toString(tmpHash);
}

module.exports = {
    scalar2fea,
    fea2scalar,
    fe2n,
    keyEthAddrBalance,
    keyEthAddrNonce,
    keyContractCode,
    keyContractStorage,
    getCurrentDB,
    hashContractBytecode,
    h4toScalar,
    h4toString,
    stringToH4,
};
