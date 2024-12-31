import {CSSProperties, useEffect, useRef} from "react";
import {BleConnection} from "../BleConnection";

export default function EspImg(props: {ble: BleConnection, src: string, alt?: string, style?: CSSProperties}) {
    const iconRef = useRef<HTMLImageElement>(null);

    const {ble, src, alt, style} = props;

    useEffect(() => {
        if (iconRef.current) {
            ble.executeCommandBinaryResult(`fs cat ${src}`).then(data => {
                if (!iconRef.current) {
                    return;
                }
                const blob = new Blob([data]);
                const url = URL.createObjectURL(blob);
                const img = iconRef.current;
                img.src = url;
                // So the Blob can be Garbage Collected
                img.onload = e => URL.revokeObjectURL(url);
            }).catch(() => {
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <img ref={iconRef} style={style} alt={alt ?? ""} />;
}