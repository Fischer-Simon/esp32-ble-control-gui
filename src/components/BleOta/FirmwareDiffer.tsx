/* eslint-disable react-hooks/exhaustive-deps */
import {useEffect} from "react";
import {WasmExports} from "./BleOta";

type Props = {
    wasm: WasmExports,
    oldFirmware: Uint8Array,
    newFirmware: Uint8Array,
    onFinish: (data: Uint8Array, rawDiffSize: number) => void,
    onError: (code: number) => void,
}

export default function FirmwareDiffer(props: Props) {
    const {
        wasm,
        oldFirmware,
        newFirmware,
        onFinish,
        onError
    } = props;
    useEffect(() => {
        const diffFirmware = async () => {
            const oldDataPtr = wasm.malloc(oldFirmware.byteLength);
            const oldData = new Uint8Array(wasm.memory.buffer, oldDataPtr, oldFirmware.byteLength);
            oldData.set(oldFirmware);

            const newDataPtr = wasm.malloc(newFirmware.byteLength);
            const newData = new Uint8Array(wasm.memory.buffer, newDataPtr, newFirmware.byteLength);
            newData.set(newFirmware);

            const patchDataSize = newFirmware.byteLength + 102400;
            const patchDataPtr = wasm.malloc(patchDataSize);

            const rawPatchSizePtr = wasm.mallocSizePtr();

            const patchSize = wasm.generate_patch(oldDataPtr, oldData.length, newDataPtr, newData.length, patchDataPtr, patchDataSize, rawPatchSizePtr);

            if (patchSize <= 0) {
                wasm.free(oldDataPtr);
                wasm.free(newDataPtr);
                wasm.free(patchDataPtr);

                onError(patchSize);
                return;
            }
            const patch = Uint8Array.from(new Uint8Array(wasm.memory.buffer, patchDataPtr, patchSize));
            const rawPatchSize = wasm.getSize(rawPatchSizePtr);

            wasm.free(rawPatchSizePtr);
            wasm.free(oldDataPtr);
            wasm.free(newDataPtr);
            wasm.free(patchDataPtr);

            onFinish(patch, rawPatchSize);
        };
        setTimeout(diffFirmware, 50);
    }, []);

    return <span className="loader"></span>
}
