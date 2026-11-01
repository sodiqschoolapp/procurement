"use client";

import { useTranslations } from "next-intl";

import { Select } from "@/components/ui/select";

// The chapter list of the Help page on a phone (plan of 9.7, What will exist): a select above the
// text that jumps to the chapter chosen; from 1024 px the list stands beside the text instead.
export function ChapterSelect({ chapters }: { chapters: { id: string; title: string }[] }) {
  const t = useTranslations("help");
  return (
    <div className="lg:hidden">
      <label htmlFor="help-chapter" className="mb-1 block text-sm text-muted-foreground">
        {t("goTo")}
      </label>
      <Select
        id="help-chapter"
        defaultValue=""
        onChange={(event) => {
          if (event.target.value) window.location.hash = event.target.value;
        }}
      >
        <option value="" disabled>
          {t("chapters")}
        </option>
        {chapters.map((chapter) => (
          <option key={chapter.id} value={chapter.id}>
            {chapter.title}
          </option>
        ))}
      </Select>
    </div>
  );
}
