/* eslint-disable react-hooks/exhaustive-deps */
import {BleConnection} from "../../BleConnection";
import {useEffect, useState} from "react";
import {getFirmwareHash, putFirmwareToLocalCache} from "./FirmwareDownloader";
import Loader from "../Loader";

type Props = {
    ble: BleConnection,
    newFirmware: Uint8Array,
    onFinish: () => void,
    onError: (msg: string) => void,
}

export default function FirmwareSelfTest(props: Props) {
    const {
        ble,
        newFirmware,
        onFinish,
        onError
    } = props;

    useEffect(() => {
        const validateFirmwareInfo = async (firmwareHash: string) => {
            const firmwareInfo = JSON.parse(await ble.executeCommand("firmware info"));
            if (firmwareInfo["hash"] !== firmwareHash) {
                throw Error("Firmware hash validation failed");
            }
        }
        const resetEsp = async (firmwareHash: string) => {
            let gotDisconnect = false;
            await ble.executeCommand("reset 0").catch(reason => gotDisconnect = reason === "Disconnect");
            if (!gotDisconnect) {
                throw Error("ESP reset failed");
            }
            await ble.start();
            await validateFirmwareInfo(firmwareHash);
        }
        const testFirmware   = async () => {
            const firmwareHash = await getFirmwareHash(newFirmware);
            try {
                await resetEsp(firmwareHash);
                await ble.executeCommand("firmware request-recovery");
                await resetEsp(firmwareHash);
                const selfTestResult = JSON.parse(await ble.executeCommand("firmware self-test"));
                if (!("success" in selfTestResult) || selfTestResult["success"] !== 1) {
                    onError(`Firmware self test failed: ${JSON.stringify(selfTestResult)}`);
                    return;
                }
                await resetEsp(firmwareHash);
                onFinish();
            } catch (e) {
                try {
                    // Should trigger a firmware rollback.
                    await resetEsp(firmwareHash);
                } catch {
                }
                onError(e instanceof Error ? e.message : "Unknown");
            }
        };
        testFirmware();
    }, []);

    return <h3><Loader/> Self test running...</h3>
}
