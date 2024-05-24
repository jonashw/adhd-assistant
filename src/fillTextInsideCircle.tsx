import { CSSProperties } from "react";

type Line = { width: number; text: string; };
export function fillTextInsideCircle(
    ctx: CanvasRenderingContext2D,
    globalScale: number,
    x: number, y: number,
    circleRadius: number,
    label: string,
    fillColor: CSSProperties["color"]
) {
    ctx.save();
    const fontSize = 12 / globalScale;
    const lineHeight = fontSize * 1.2;
    ctx.font = `${fontSize}px Sans-Serif`;
    const metrics = ctx.measureText(label);
    const targetWidth = Math.sqrt(metrics.width * lineHeight);//why this?
    const words = label.trim().split(/\s+/g).filter(w => w);
    const makeLine = (text:string): Line => ({
        text,
        width: ctx.measureText(text).width 
    });
    const lines = words.reduce((lines, word) => {
        const currentLine = lines[lines.length-1];
        if(!currentLine){
            return [makeLine(word)];
        }
        const extendedCurrentLine = makeLine((currentLine.text + ' ' + word).trim());
        return extendedCurrentLine.width <= targetWidth
            ? lines.map(l => l === currentLine ? extendedCurrentLine : l)
            : [...lines, makeLine(word)];
    }, [] as Line[]);
    const textRadius = (() => {
        let radius = 0;
        for (let i = 0, n = lines.length; i < n; ++i) {
            const dy = (Math.abs(i - n / 2 + 0.5) + 0.5) * lineHeight;
            const dx = lines[i].width / 2;
            radius = Math.max(radius, Math.sqrt(dx ** 2 + dy ** 2));
        }
        return radius;
    })();
    const scaleFactor = circleRadius / textRadius;
    //console.log({ targetWidth, textRadius, circleRadius, scaleFactor, label, lines });
    //ctx.fillStyle = nodeColor(node);
    //ctx.arc(node.x!,node.y!,nodeRadius,0,2*Math.PI);
    //ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = "middle";
    ctx.fillStyle = fillColor?.toString() ?? "black";
    //const h = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    ctx.translate(x, y);
    ctx.scale(scaleFactor,scaleFactor);
    ctx.translate(0,-Math.floor((lines.length-1) * lineHeight)/2);
    /*
    ctx.beginPath();
    ctx.lineWidth = 1;
    ctx.arc(0, 0, circleRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.stroke();
    */
    //ctx.fillRect(0,0,1,1);
    for (const l of lines) {
        ctx.fillText(l.text, 0, 0);
        ctx.translate(0, lineHeight);
    }

    ctx.restore();
}
