import React from "react";
import "./crew.css";

/* The frame every crew drawing shares: sizing by height, a label for screen readers, and the class names the CSS moves */
export function CrewSvg({width, height, size, label, classes, children}: {
    width: number,
    height: number,
    /* height on screen, in px */
    size: number,
    label: string,
    classes: (string | false | undefined)[],
    children: React.ReactNode
}) {
    return (
        <svg
            className={["crew", ...classes].filter(Boolean).join(" ")}
            viewBox={`0 0 ${width} ${height}`}
            width={size * width / height}
            height={size}
            role="img"
            aria-label={label}
        >
            <title>{label}</title>
            {children}
        </svg>
    );
}

/* A robot's eye: a lit dot with a soft glow round it */
export function Eye({x, y, r}: {x: number, y: number, r: number}) {
    return (
        <>
            <circle cx={x} cy={y} r={r * 1.9} className="crew-glow"/>
            <circle cx={x} cy={y} r={r} className="crew-eye"/>
        </>
    );
}

/* An eye shut in sleep: a lit curve */
export function ShutEye({x, y, w}: {x: number, y: number, w: number}) {
    return <path d={`M${x - w / 2} ${y} Q${x} ${y + w * 0.6} ${x + w / 2} ${y}`} className="crew-shut"/>;
}
