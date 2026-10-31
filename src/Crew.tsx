/* The robot crew, as simple static icons for now. Each is its own component, so finer art can replace it later. */

const crew = {
    dog: {glyph: "🐕", name: "Robot dog"},
    spider: {glyph: "🕷️", name: "Robot spider"},
    squirrel: {glyph: "🐿️", name: "Robot flying squirrel"},
    sloth: {glyph: "🦥", name: "Robot sloth"}
};

export function CrewIcon({who, size = 24}: {who: keyof typeof crew, size?: number}) {
    return (
        <span role="img" aria-label={crew[who].name} title={crew[who].name}
            style={{fontSize: size, lineHeight: 1, display: "inline-block"}}>
            {crew[who].glyph}
        </span>
    );
}
