import "~/styles/application.css";
import { MapEditor } from "~/editor/MapEditor";

declare global {
  interface Window {
    __HELLTOWN_EDITOR__: {
      map: {
        id: number;
        name: string;
        width: number;
        height: number;
        tile_data: string | null;
        spawn_x: number;
        spawn_y: number;
        tileset: string;
        video_mode: string;
      };
      csrfToken: string;
    };
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("editor-canvas") as HTMLCanvasElement;
  if (canvas && window.__HELLTOWN_EDITOR__) {
    const editor = new MapEditor(canvas, window.__HELLTOWN_EDITOR__);
    editor.start();
  }
});
