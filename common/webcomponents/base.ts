// components/base.ts
import type { VNObject } from "../sidebar.ts";

export abstract class VNComponent extends HTMLElement {
  protected _data!: VNObject;

  set data(obj: VNObject) {
    this._data = obj;
    this.render();
  }

  protected abstract render(): void;

  protected root: ShadowRoot;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }
}