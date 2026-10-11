// LanguagePickerPage — 语言 picker built on the shared card-style page.
import React from "react";
import { Theme } from "../../theme/theme";
import type { Lang, TKey, TVars } from "../../i18n";
import { CardPickerPage, type CardPickerOption } from "./CardPickerPage";

export function LanguagePickerPage({
  theme,
  lang,
  t,
  onSelect,
  onBack,
}: {
  theme: Theme;
  lang: Lang;
  t: (key: TKey, vars?: TVars) => string;
  onSelect: (lang: Lang) => void;
  onBack: () => void;
}) {
  const options: CardPickerOption[] = [
    {
      id: "zh",
      title: t("me.langZhFull"),
      description: t("me.langZhDesc"),
    },
    {
      id: "en",
      title: t("me.langEnFull"),
      description: t("me.langEnDesc"),
    },
    {
      id: "system",
      title: t("me.langSystemFull"),
      description: t("me.langSystemDesc"),
    },
  ];

  return (
    <CardPickerPage
      theme={theme}
      navTitle={t("me.languageSettings")}
      options={options}
      selectedId={lang}
      onSelect={(id) => onSelect(id as Lang)}
      onBack={onBack}
    />
  );
}
