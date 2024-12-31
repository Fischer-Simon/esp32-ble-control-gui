import "./CollapsibleCard.scss"
import React, {useState} from "react"

// export function CardHeader()

export default function CollapsibleCard(props: {
    header: string | React.JSX.Element,
    visible?: boolean,
    opensUp?: boolean,
    className?: string,
    onVisibleChange?: (visible: boolean) => void,
    children: React.ReactNode
}) {
    const [visible, setVisible] = useState<boolean>(props.visible === undefined ? true : props.visible);

    const className = props.className || '';

    return <article
        className={`card collapsible ${visible ? 'expanded' : 'collapsed'} ${props.opensUp ? 'inverse-icon' : ''} ${className}`}>
        <header onClick={() => {
            setVisible(!visible);
            props.onVisibleChange && props.onVisibleChange(!visible);
        }}>
            <div>{props.header}</div>
        </header>
        {props.children}
    </article>
}
