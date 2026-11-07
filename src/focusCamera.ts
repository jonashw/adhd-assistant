/* Where the camera goes to show a project's branch above its card. Only the camera moves: no node is touched.
   The graph library centres on the middle of the whole canvas, so to land the branch in the free band
   (between the top of the canvas and the top of the card) the centre point is shifted by the gap between
   the canvas's middle and the band's middle, measured in graph units. */

export type Box = {x0: number, y0: number, x1: number, y1: number};
export type View = {k: number, x: number, y: number};

/* Room around each node for its label and badge, in graph units (labels sit under the node) */
const labelPad = {side: 26, top: 10, bottom: 26};

export function branchBox(points: {x?: number, y?: number}[]): Box | undefined {
    const placed = points.filter((p): p is {x: number, y: number} => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (placed.length === 0) {
        return undefined;
    }
    return {
        x0: Math.min(...placed.map(p => p.x)) - labelPad.side,
        x1: Math.max(...placed.map(p => p.x)) + labelPad.side,
        y0: Math.min(...placed.map(p => p.y)) - labelPad.top,
        y1: Math.max(...placed.map(p => p.y)) + labelPad.bottom
    };
}

export function fitIntoBand(box: Box, canvas: {width: number, height: number}, band: {top: number, bottom: number},
    margin = 16, maxZoom = 6): View {
    const bandTop = band.top + margin;
    const bandBottom = Math.max(bandTop + 40, band.bottom - margin);
    const k = Math.min(
        (canvas.width - 2 * margin) / Math.max(1, box.x1 - box.x0),
        (bandBottom - bandTop) / Math.max(1, box.y1 - box.y0),
        maxZoom
    );
    const bandMiddle = (bandTop + bandBottom) / 2;
    return {
        k,
        x: (box.x0 + box.x1) / 2,
        y: (box.y0 + box.y1) / 2 + (canvas.height / 2 - bandMiddle) / k
    };
}
