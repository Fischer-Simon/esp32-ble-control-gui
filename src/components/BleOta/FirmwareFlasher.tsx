/* eslint-disable react-hooks/exhaustive-deps */
import {BleConnection} from "../../BleConnection";
import {useEffect, useState} from "react";
import {getFirmwareHash, putFirmwareToLocalCache} from "./FirmwareDownloader";
import Loader from "../Loader";

type Props = {
    ble: BleConnection,
    oldFirmware: Uint8Array,
    newFirmware: Uint8Array,
    patch: Uint8Array,
    rawPatchSize: number,
    onFinish: () => void,
    onError: (msg: string) => void,
}

export default function FirmwareFlasher(props: Props) {
    const [bytesFlashed, setBytesFlashed] = useState<number>(0);

    const {
        ble,
        oldFirmware,
        newFirmware,
        patch,
        rawPatchSize,
        onFinish,
        onError
    } = props;

    useEffect(() => {
        const flashFirmware = async () => {
            console.log(
                `Image size: ${newFirmware.byteLength.toLocaleString()} `,
                `Raw patch size: ${rawPatchSize.toLocaleString()} `,
                `Compressed patch size: ${patch.byteLength.toLocaleString()}`
            )

            let statusBuffer = "";
            let success = false;
            const args = `${patch.byteLength} ${rawPatchSize} ${newFirmware.byteLength} ${oldFirmware.byteLength}`;
            ble.executeCommand(`firmware flash-delta ${args}`, patch, data => {
            // ble.executeCommand(`test-upload ${patch.byteLength} 256 100 0`, patch, data => {
                statusBuffer += ble.decodeText(data);
                let newLinePos = statusBuffer.indexOf("\n")
                while (newLinePos >= 0) {
                    const statusLine = statusBuffer.substring(0, newLinePos);
                    statusBuffer = statusBuffer.substring(newLinePos + 1);

                    try {
                        const status = JSON.parse(statusLine);
                        if ("error" in status) {
                            onError(status["error"] as string);
                        }
                        if ("success" in status) {
                            success = true;
                        }
                        if ("progress" in status) {
                            setBytesFlashed(status["progress"] as number);
                        }
                    } catch (e) {
                        onError(e instanceof Error ? e.message : statusLine);
                    }

                    newLinePos = statusBuffer.indexOf("\n")
                }
            })
                .then(async () => {
                    if (!success) {
                        console.log(statusBuffer);
                        onError("Unknown");
                        return;
                    }
                    const firmwareHash = await getFirmwareHash(newFirmware);
                    putFirmwareToLocalCache(firmwareHash, newFirmware);
                    onFinish();
                })
                .catch(e => {
                    console.log(e);
                    onError(e instanceof Error ? e.message : "Unknown");
                })
        };
        flashFirmware();
    }, []);

    if (bytesFlashed > 0) {
        return <div className="progress">
            <div style={{width: (100 * bytesFlashed / props.newFirmware.byteLength) + "%"}}/>
        </div>
    }
    return <h3><Loader /> Preparing...</h3>
}
