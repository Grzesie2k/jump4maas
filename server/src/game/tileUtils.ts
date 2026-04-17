import { CONFIG } from "../config";
import { Tile } from "@shared/types";

export function getTileAt(tiles: number[], col: number, row: number): number {
  if (col < 0 || col >= CONFIG.LEVEL_WIDTH_TILES) return Tile.Ground;
  if (row < 0) return Tile.Empty;
  if (row >= CONFIG.LEVEL_HEIGHT_TILES) return Tile.Empty;
  return tiles[row * CONFIG.LEVEL_WIDTH_TILES + col];
}

export function isSolid(tile: number): boolean {
  return tile === Tile.Ground || tile === Tile.Platform;
}
