/** Light plotly for demo-kit 3D plots, bundled as public/demo-kit/plotly-light.js:
 *  plotly's core (which has scatter) plus the trace types in
 *  LIGHT_PLOTLY_TRACES (plotly-gate.ts). Plots with other types load the full
 *  plotly.js. Hand-written demos that reference /demo-kit/plotly.js keep it.
 *
 *  Exposes window.PlotlyLight, and window.Plotly only when no plotly is
 *  loaded yet, so it never replaces a full build already in the frame. */
import Plotly from "plotly.js/lib/core";
import scatter3d from "plotly.js/lib/scatter3d";
import surface from "plotly.js/lib/surface";
import mesh3d from "plotly.js/lib/mesh3d";
import cone from "plotly.js/lib/cone";
import streamtube from "plotly.js/lib/streamtube";
import isosurface from "plotly.js/lib/isosurface";
import volume from "plotly.js/lib/volume";
import contour from "plotly.js/lib/contour";
import heatmap from "plotly.js/lib/heatmap";

Plotly.register([scatter3d, surface, mesh3d, cone, streamtube, isosurface, volume, contour, heatmap]);

const w = window as unknown as { Plotly?: unknown; PlotlyLight?: unknown };
w.PlotlyLight = Plotly;
w.Plotly ??= Plotly;
