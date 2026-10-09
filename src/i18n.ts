import merge from "lodash/merge";
import Mustache from "mustache";

import { LANGS as LANGS_PRO } from "../pro/src/langs";
import { LANGS as LANGS_BASIC } from "./langs";

const LANGS = merge(LANGS_BASIC, LANGS_PRO);

export type LangType = keyof typeof LANGS;
export type LangTypeAndAuto = LangType | "auto";
export type TransItemType = keyof (typeof LANGS)["en"];

export class I18n {
  lang: LangTypeAndAuto;
  readonly saveSettingFunc: (tolang: LangTypeAndAuto) => Promise<void>;
  constructor(
    lang: LangTypeAndAuto,
    saveSettingFunc: (tolang: LangTypeAndAuto) => Promise<void>
  ) {
    this.lang = lang;
    this.saveSettingFunc = saveSettingFunc;
  }
  async changeTo(anotherLang: LangTypeAndAuto) {
    this.lang = anotherLang;
    await this.saveSettingFunc(anotherLang);
  }

  _get(key: TransItemType) {
    // This fork shows Simplified Chinese for every user-facing string.
    const zh = LANGS.zh_cn as unknown as (typeof LANGS)["en"];
    const res: string = zh[key] || LANGS.en[key] || key;
    return res;
  }

  t(key: TransItemType, vars?: Record<string, string>) {
    if (vars === undefined) {
      return this._get(key);
    }
    return Mustache.render(this._get(key), vars);
  }
}
