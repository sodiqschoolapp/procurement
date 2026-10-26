import { ORDER_FIELDS_DEFAULT, type OrderFields } from "@/domain/order-fields";
import { now } from "@/server/clock";
import { db } from "@/server/db/client";
import { settings } from "@/server/db/schema";

// The setting `order_fields` written straight (05-order-request-form.md, Fields the Head sets),
// for a test whose subject is not the settings form: the defaults with the rules given.

export async function setOrderFields(rules: Partial<OrderFields>) {
  const value = { ...ORDER_FIELDS_DEFAULT, ...rules };
  await db
    .insert(settings)
    .values({ key: "order_fields", value, createdAt: now() })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}
