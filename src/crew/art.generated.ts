/* Made by scripts/build-art.mjs from art/. Don't edit: change the drawing in Inkscape and run npm run art. */
export const art = {
    "face": {
        "viewBox": [
            -6,
            -6,
            12,
            12
        ],
        "layers": {
            "calm": "<g class=\"face-calm\"><g class=\"eyes\"><circle cx=\"-3\" cy=\"-0.8\" r=\"1.7\" fill=\"#ffffff\"/><circle cx=\"3\" cy=\"-0.8\" r=\"1.7\" fill=\"#ffffff\"/></g><path d=\"M-3.8 3 q3.8 3.6 7.6 0\" fill=\"none\" stroke=\"#ffffff\" stroke-width=\"2\" stroke-linecap=\"round\" class=\"mouth\"/></g>",
            "blink": "<g class=\"face-blink\"><g fill=\"none\" stroke=\"#ffffff\" stroke-width=\"1.2\" stroke-linecap=\"round\" class=\"eyes-shut\"><path d=\"M-4.6 -0.8 q1.6 1.2 3.2 0\"/><path d=\"M1.4 -0.8 q1.6 1.2 3.2 0\"/></g><path d=\"M-3.8 3 q3.8 3.6 7.6 0\" fill=\"none\" stroke=\"#ffffff\" stroke-width=\"2\" stroke-linecap=\"round\"/></g>"
        }
    },
    "balloon": {
        "viewBox": [
            -10,
            -11.5,
            20,
            24
        ],
        "art": "<g class=\"art\"><path d=\"M-1.4 11.6 L0 9.6 L1.4 11.6 Z\" fill=\"#b71c1c\" class=\"knot\"/><ellipse cx=\"0\" cy=\"0\" rx=\"8.6\" ry=\"10\" fill=\"#d32f2f\" stroke=\"#b71c1c\" stroke-width=\"0.6\" class=\"balloon\"/><ellipse cx=\"-3.6\" cy=\"-4.5\" rx=\"1.7\" ry=\"3.2\" transform=\"rotate(25 -3.6 -4.5)\" fill=\"#ffffff\" opacity=\"0.45\" class=\"shine\"/></g>",
        "anchors": {
            "face": {
                "x": -6,
                "y": -6,
                "width": 12,
                "height": 12
            },
            "string": {
                "x": 0,
                "y": 11.6
            }
        }
    }
} as const;
