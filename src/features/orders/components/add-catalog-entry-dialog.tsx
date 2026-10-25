"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import {
  addProductWhileOrderingAction,
  addSubtypeWhileOrderingAction,
  listAddChoicesAction,
  searchDraftProductsAction,
} from "@/app/(app)/orders/actions";
import { newClientKey } from "@/components/client-key";
import { uploadFile } from "@/components/files/upload";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { useAction } from "@/components/use-action";
import { cn } from "@/components/utils";
import { IMAGE_MIMES } from "@/domain/files";
import type { WireProduct } from "@/features/orders/draft-wire";

import type { PickedSubtype } from "./product-picker";

// The small form behind the product search's last line "Add …" (04-catalogs.md rule 8; 05 field
// 2; 11-screens-and-ux.md rule 2; plan of 1.12b): a new product (name, product or service,
// category, measure, optional photo) or a new subtype of a picked product (name, optional photo;
// for a product without subtypes also what its existing items are called). On save the row takes
// the new entry through the search's own pick (decided item 9). A name already in the catalog is
// offered instead (rule 3): an active one with "Use it", an inactive one only named. Closing it
// with something typed asks first (11 rule 6). Base UI's Dialog keeps focus inside and gives it
// back; centred as the confirm dialog, within the 16 px gutter on a phone.

type Kind = "product" | "subtype";
type Choice = { id: string; name: string };
type Offered = { name: string; isActive: boolean; productName: string; variantId: string | null };

/** The hit of the search for one subtype, so the row takes it as any pick (decided item 9). */
async function pickOf(
  branchId: string,
  productName: string,
  variantId: string | null,
): Promise<PickedSubtype | null> {
  const result = await searchDraftProductsAction({ branchId, q: productName });
  if (!result.ok) return null;
  const product = result.data.find((one) => one.name === productName);
  if (!product) return null;
  const subtype = variantId
    ? product.subtypes.find((one) => one.id === variantId)
    : product.subtypes.length === 1
      ? product.subtypes[0]
      : undefined;
  return subtype ? { product, subtype } : null;
}

export function AddCatalogEntryDialog({
  open,
  typed,
  branchId,
  onClose,
  onPicked,
  onSearch,
}: {
  open: boolean;
  /** The text typed in the search: the name the form starts with. */
  typed: string;
  branchId: string;
  onClose(): void;
  /** The new or the offered entry, as the search would give it. */
  onPicked(picked: PickedSubtype): void;
  /** An offered product with subtypes: the search opens on its name, to pick the subtype. */
  onSearch(text: string): void;
}) {
  const t = useTranslations("orders.addEntry");
  const tAll = useTranslations();
  const [kind, setKind] = useState<Kind>("product");
  const [name, setName] = useState(typed);
  const [type, setType] = useState<"GOODS" | "SERVICE">("GOODS");
  const [categoryId, setCategoryId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [choices, setChoices] = useState<{ categories: Choice[]; measures: Choice[] } | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [products, setProducts] = useState<WireProduct[]>([]);
  const [product, setProduct] = useState<WireProduct | null>(null);
  const [existingName, setExistingName] = useState("");
  const [offered, setOffered] = useState<Offered | null>(null);
  const [asking, setAsking] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const addProduct = useAction(addProductWhileOrderingAction, { create: true });
  const addSubtype = useAction(addSubtypeWhileOrderingAction, { create: true });
  const action = kind === "product" ? addProduct : addSubtype;

  // The product has no subtypes yet: only its hidden default, shown without a name.
  const withoutSubtypes =
    product !== null && product.subtypes.length === 1 && product.subtypes[0]!.name === null;
  const dirty =
    name.trim() !== typed.trim() || photoFileId !== null || product !== null || existingName !== "";

  useEffect(() => {
    if (!open || choices) return;
    void listAddChoicesAction().then((result) => {
      if (result.ok) setChoices(result.data);
    });
  }, [open, choices]);

  useEffect(() => {
    if (!open || kind !== "subtype" || product) return;
    const timer = setTimeout(async () => {
      const result = await searchDraftProductsAction({ branchId, q: productQuery });
      setProducts(result.ok ? result.data : []);
    }, 250);
    return () => clearTimeout(timer);
  }, [open, kind, product, productQuery, branchId]);

  function close() {
    if (dirty && !asking) {
      setAsking(true);
      return;
    }
    onClose();
  }

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadFile(file, "photo", newClientKey());
      if (!result.ok) {
        toast.error(tAll(result.error.messageKey));
        return;
      }
      setPhotoFileId(result.data.id);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function save() {
    setOffered(null);
    if (kind === "product") {
      const result = await addProduct.run({ name, type, categoryId, unitId, photoFileId });
      if (!result?.ok) return;
      if (result.data.outcome === "exists") {
        setOffered({
          name: result.data.name,
          isActive: result.data.isActive,
          productName: result.data.name,
          variantId: null,
        });
        return;
      }
      await take(result.data.name, result.data.variantId);
      return;
    }
    if (!product) return;
    const result = await addSubtype.run({
      productId: product.id,
      name,
      photoFileId,
      existingName: withoutSubtypes ? existingName : null,
    });
    if (!result?.ok) return;
    if (result.data.outcome === "exists") {
      setOffered({
        name: result.data.name,
        isActive: result.data.isActive,
        productName: product.name,
        variantId: result.data.variantId,
      });
      return;
    }
    await take(product.name, result.data.variantId);
  }

  /** Puts the entry on the row through the search, or opens the search on the product's name. */
  async function take(productName: string, variantId: string | null) {
    const picked = await pickOf(branchId, productName, variantId);
    if (picked) {
      toast.success(t("added"));
      onPicked(picked);
    } else {
      onSearch(productName);
    }
  }

  const fieldText = (key: string) => action.fieldTexts[key];

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && !action.pending && close()}>
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] transition-opacity duration-160 ease-out",
            "data-ending-style:opacity-0 data-starting-style:opacity-0",
          )}
        />
        <Dialog.Popup
          data-add-entry
          className={cn(
            "fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto",
            "rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-float sm:p-6",
            "transition-[opacity,scale] duration-160 ease-out",
            "data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
          )}
        >
          <Dialog.Title className="text-subheading font-semibold">{t("title")}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {t("intro")}
          </Dialog.Description>

          <form
            noValidate
            className="mt-4 flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <Segmented
              label={t("kind")}
              value={kind}
              onValueChange={(value) => {
                setKind(value);
                setOffered(null);
              }}
              options={[
                { value: "product", label: t("newProduct") },
                { value: "subtype", label: t("newSubtype") },
              ]}
            />

            {kind === "subtype" &&
              (product ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-xs text-muted-foreground">{t("ofProduct")}</span>
                    <span data-picked-product className="block truncate text-sm font-semibold">
                      {product.name}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setProduct(null);
                      setExistingName("");
                    }}
                  >
                    {t("otherProduct")}
                  </Button>
                </div>
              ) : (
                <Field id="add-entry-product" label={t("ofProduct")} error={fieldText("productId")}>
                  <Input
                    value={productQuery}
                    autoComplete="off"
                    placeholder={tAll("orders.picker.placeholder")}
                    onChange={(event) => setProductQuery(event.target.value)}
                  />
                  <ul className="mt-1 flex max-h-48 flex-col overflow-y-auto">
                    {products.map((one) => (
                      <li key={one.id}>
                        <button
                          type="button"
                          className="flex min-h-11 w-full items-center rounded-lg px-2 text-left text-sm hover:bg-accent"
                          onClick={() => setProduct(one)}
                        >
                          {one.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </Field>
              ))}

            <Field
              id="add-entry-name"
              label={kind === "product" ? t("productName") : t("subtypeName")}
              error={fieldText("name")}
            >
              <Input
                value={name}
                autoComplete="off"
                maxLength={200}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>

            {kind === "subtype" && withoutSubtypes && (
              <div className="flex flex-col gap-1.5">
                <Field
                  id="add-entry-existing"
                  label={t("existingName")}
                  error={fieldText("existingName")}
                >
                  <Input
                    value={existingName}
                    autoComplete="off"
                    maxLength={200}
                    aria-describedby="add-entry-existing-hint"
                    onChange={(event) => setExistingName(event.target.value)}
                  />
                </Field>
                <p id="add-entry-existing-hint" className="text-sm text-muted-foreground">
                  {t("existingHint")}
                </p>
              </div>
            )}

            {kind === "product" && (
              <>
                <Segmented
                  label={tAll("catalog.fields.type")}
                  value={type}
                  onValueChange={setType}
                  options={[
                    { value: "GOODS", label: tAll("catalog.productType.GOODS") },
                    { value: "SERVICE", label: tAll("catalog.productType.SERVICE") },
                  ]}
                />
                <Field
                  id="add-entry-category"
                  label={tAll("catalog.fields.categoryId")}
                  error={fieldText("categoryId")}
                >
                  <Select
                    value={categoryId}
                    onChange={(event) => setCategoryId(event.target.value)}
                  >
                    <option value="">{t("choose")}</option>
                    {choices?.categories.map((one) => (
                      <option key={one.id} value={one.id}>
                        {one.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  id="add-entry-unit"
                  label={tAll("catalog.fields.unitId")}
                  error={fieldText("unitId")}
                >
                  <Select value={unitId} onChange={(event) => setUnitId(event.target.value)}>
                    <option value="">{t("choose")}</option>
                    {choices?.measures.map((one) => (
                      <option key={one.id} value={one.id}>
                        {one.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInput}
                id="add-entry-photo"
                type="file"
                aria-label={tAll("catalog.fields.photoFileId")}
                tabIndex={-1}
                accept={IMAGE_MIMES.join(",")}
                className="sr-only"
                onChange={(event) => void choosePhoto(event.target.files?.[0])}
              />
              {photoFileId && (
                // eslint-disable-next-line @next/next/no-img-element -- a private file route, not an asset
                <img
                  src={`/files/${photoFileId}/small`}
                  alt=""
                  width={44}
                  height={44}
                  className="size-11 rounded-lg bg-muted object-cover"
                />
              )}
              <Button
                type="button"
                variant="secondary"
                icon={photoFileId ? "edit" : "add"}
                pending={uploading}
                onClick={() => fileInput.current?.click()}
              >
                {tAll(
                  uploading
                    ? "catalog.photoUploading"
                    : photoFileId
                      ? "catalog.photoReplace"
                      : "catalog.photoAdd",
                )}
              </Button>
            </div>

            {offered && (
              <div
                role="status"
                data-offered
                className="flex flex-col gap-2 rounded-lg border border-border bg-muted p-3 text-sm"
              >
                <span className="flex items-start gap-2">
                  <Icon name="info" size={18} className="mt-0.5 shrink-0" />
                  {offered.isActive
                    ? t("exists", { name: offered.name })
                    : t("existsInactive", { name: offered.name })}
                </span>
                {offered.isActive && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="self-start"
                    onClick={() => void take(offered.productName, offered.variantId)}
                  >
                    {t("useIt")}
                  </Button>
                )}
              </div>
            )}

            {action.errorText && !offered && (
              <p role="alert" className="text-sm text-destructive">
                {action.errorText}
              </p>
            )}

            {asking ? (
              <div
                role="alert"
                data-discard
                className="flex flex-col gap-3 rounded-lg border border-border p-3"
              >
                <p className="text-sm">{t("discardQuestion")}</p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="secondary" onClick={() => setAsking(false)}>
                    {t("keepEditing")}
                  </Button>
                  <Button type="button" variant="destructive" onClick={onClose}>
                    {t("discard")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={close} disabled={action.pending}>
                  {tAll("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  pending={action.pending}
                  disabled={uploading || (kind === "subtype" && !product)}
                >
                  {t("save")}
                </Button>
              </div>
            )}
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
