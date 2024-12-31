/* eslint-disable react-hooks/exhaustive-deps */
import {BleConnection} from "../../BleConnection";
import {CSSProperties, useEffect, useState} from "react";
import {HeatshrinkStatus, WasmExports} from "./BleOta";

const COMPRESSION_BUFFER_SIZE = 1024;

type FirmwareInfo = {
    size: number,
    hash: string,
}

type Props = {
    ble: BleConnection,
    wasm: WasmExports,
    onFinish: (data: Uint8Array) => void,
    onError: () => void,
}

function concatBuffer(a: Uint8Array, b: Uint8Array): Uint8Array {
    const newBuffer = new Uint8Array(a.byteLength + b.byteLength);
    newBuffer.set(a);
    newBuffer.set(b, a.byteLength);
    return newBuffer;
}

let db: IDBDatabase | null = null;

async function getFirmwareFromLocalCache(hash: string): Promise<Uint8Array | null> {
    let resolvePromise = (data: Uint8Array | null) => {
    };
    let rejectPromise = (reason: string) => {
    };

    const promise = new Promise<Uint8Array | null>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    })

    const fetchResult = (db: IDBDatabase) => {
        const transaction = db.transaction(["firmware"]);
        const objectStore = transaction.objectStore("firmware");
        const fetchRequest = objectStore.get(hash);
        fetchRequest.onsuccess = () => {
            resolvePromise(fetchRequest.result ? fetchRequest.result["data"] as Uint8Array : null);
        }
        fetchRequest.onerror = () => {
            resolvePromise(null);
        }
    }

    if (db == null) {
        const request = indexedDB.open("FirmwareCache");
        request.addEventListener("success", e => {
            db = request.result;
            fetchResult(db);
        });
        request.onupgradeneeded = e => {
            const db = request.result;
            db.createObjectStore("firmware", {keyPath: "hash"});
            resolvePromise(null);
        }
        request.onerror = e => {
            rejectPromise("error");
        }
    } else {
        fetchResult(db);
    }

    return promise;
}

export function putFirmwareToLocalCache(hash: string, data: Uint8Array) {
    if (db === null) {
        // The db should already be open at this point.
        return;
    }

    const transaction = db.transaction(["firmware"], "readwrite");
    const objectStore = transaction.objectStore("firmware");
    const putRequest = objectStore.put({hash, data});
    putRequest.onerror = () => {
        console.log("Failed to save firmware data to cache");
    }
}

export async function getFirmwareHash(firmwareData: Uint8Array): Promise<string> {
    const firmwareHash = await window.crypto.subtle.digest("SHA-256", firmwareData.slice(0, firmwareData.byteLength - 32));
    return Array.from(new Uint8Array(firmwareHash)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

export default function FirmwareDownloader(props: Props) {
    const [bytesReceived, setBytesReceived] = useState<number>(0);
    const [firmwareSize, setFirmwareSize] = useState<number>(0);

    const {
        ble,
        wasm,
        onFinish,
        onError
    } = props;

    useEffect(() => {
        const loadFirmware = async () => {
            const startTime = performance.now();
            let firmwareData = new Uint8Array();

            const heatshrinkDecoder = wasm.heatshrink_decoder_alloc(COMPRESSION_BUFFER_SIZE, 11, 9);
            const ioSizePtr = wasm.mallocSizePtr();
            const ioBufferPtr = wasm.malloc(COMPRESSION_BUFFER_SIZE);
            const ioBuffer = new Uint8Array(wasm.memory.buffer, ioBufferPtr, COMPRESSION_BUFFER_SIZE);

            const firmwareInfo = JSON.parse(await ble.executeCommand("firmware info")) as FirmwareInfo;
            setFirmwareSize(firmwareInfo.size);

            const cachedFirmware = await getFirmwareFromLocalCache(firmwareInfo.hash);
            if (cachedFirmware !== null) {
                onFinish(cachedFirmware);
                return;
            }

            ble.executeCommand("firmware dump", null, async (data: Uint8Array) => {
                let heatshrinkResult = -1;
                while (data.byteLength > 0) {
                    ioBuffer.set(data);
                    heatshrinkResult = wasm.heatshrink_decoder_sink(heatshrinkDecoder, ioBufferPtr, data.byteLength, ioSizePtr);
                    data = data.slice(wasm.getSize(ioSizePtr));

                    do {
                        heatshrinkResult = wasm.heatshrink_decoder_poll(heatshrinkDecoder, ioBufferPtr, COMPRESSION_BUFFER_SIZE, ioSizePtr)
                        firmwareData = concatBuffer(firmwareData, new Uint8Array(wasm.memory.buffer, ioBufferPtr, wasm.getSize(ioSizePtr)));
                        setBytesReceived(bytesReceived => bytesReceived + wasm.getSize(ioSizePtr));
                    } while (heatshrinkResult === HeatshrinkStatus.HSDR_MORE);
                }
            }).then(async () => {
                while (wasm.heatshrink_decoder_finish(heatshrinkDecoder) === HeatshrinkStatus.HSDR_MORE) {
                    wasm.heatshrink_decoder_poll(heatshrinkDecoder, ioBufferPtr, COMPRESSION_BUFFER_SIZE, ioSizePtr)
                    firmwareData = concatBuffer(firmwareData, new Uint8Array(wasm.memory.buffer, ioBufferPtr, wasm.getSize(ioSizePtr)));
                    setBytesReceived(bytesReceived => bytesReceived + wasm.getSize(ioSizePtr));
                }

                const endTime = performance.now();
                const durationSeconds = (endTime - startTime) / 1000;
                console.log(`Downloaded ${firmwareData.byteLength.toLocaleString(undefined, {maximumFractionDigits: 2})} Bytes in ${durationSeconds.toLocaleString(undefined, {maximumFractionDigits: 2})} s (${(firmwareData.byteLength / durationSeconds).toLocaleString(undefined, {maximumFractionDigits: 2})} Bytes/s)`)

                const firmwareHashHex= await getFirmwareHash(firmwareData);
                if (firmwareHashHex === firmwareInfo.hash) {
                    setBytesReceived(firmwareInfo.size);
                    putFirmwareToLocalCache(firmwareInfo.hash, firmwareData);
                    onFinish(firmwareData)
                } else {
                    onError();
                }
            }).catch(e => {
                console.log(e);
                onError();
            }).finally(() => {
                wasm.heatshrink_decoder_free(heatshrinkDecoder);
                wasm.free(ioSizePtr);
                wasm.free(ioBufferPtr);
            });
        };
        loadFirmware();
    }, []);

    return <div className="progress">
        <div style={{width: (100 * bytesReceived / firmwareSize) + "%"}}/>
    </div>
}
