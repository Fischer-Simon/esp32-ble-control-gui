import {useEffect, useState} from "react";

export enum LoaderState {
    Pending = "loader-pending",
    Normal = "",
    Success = "loader-success",
    Error = "loader-error",
}

export default function Loader(props: {state?: LoaderState, spaceRight?: boolean}) {
    return <span className={`loader ${props.spaceRight ? "space-right" : ""} ${(props.state ?? LoaderState.Normal).toString()}`} />
}
