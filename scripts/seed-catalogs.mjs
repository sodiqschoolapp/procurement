// The catalogs of `npm run db:seed` (build-plan 1.13: "measures, categories, extra cost types,
// companies, departments for both branches, and 30 products with subtypes and prices. All names
// are invented"; developer-rules.md rule 14). Written by seed() of scripts/seed.mjs inside its one
// transaction, after the branches and users, with the seed Head as the actor of every audit row
// and of every price. Every name, phone and tax ID here is invented (CLAUDE.md, Conventions), and
// every value is already in the form the create actions store (plan of 1.13, decision 11).
//
// Prices are whole so'm as BigInt literals, never computed and never a JavaScript number
// (CLAUDE.md rule 6; plan of 1.13, decision 2, Look first).
import { insertAuditRow } from "../src/server/audit-row.mjs";

/** "kg" allows decimals, "pcs" does not (04-catalogs.md, Catalogs table). */
export const SEED_MEASURES = [
  { name: "dona", shortName: "dona", allowDecimal: false },
  { name: "kilogramm", shortName: "kg", allowDecimal: true },
  { name: "litr", shortName: "l", allowDecimal: true },
  { name: "quti", shortName: "quti", allowDecimal: false },
  { name: "xizmat", shortName: "xizmat", allowDecimal: false },
];

/** "Stationery, cleaning, food, furniture, IT and so on" (04, Catalogs table). */
export const SEED_CATEGORIES = [
  "Kanselyariya",
  "Tozalash vositalari",
  "Oziq-ovqat",
  "Mebel",
  "IT jihozlari",
  "Ta'mirlash xizmatlari",
];

/** "Delivery, loading, installation and so on" (04, Catalogs table). */
export const SEED_EXTRA_COST_TYPES = ["Yetkazib berish", "Yuklash-tushirish", "O'rnatish"];

/** Each kind at least once; tax IDs and phones on those that sell (plan of 1.13, decision 9). */
export const SEED_COMPANIES = [
  {
    name: "Namuna Savdo MChJ (demo)",
    kind: "SUPPLIER",
    taxId: "300000001",
    phone: "+998 90 000 96 01",
    note: null,
  },
  {
    name: "Misol Ta'minot MChJ (demo)",
    kind: "SUPPLIER",
    taxId: "300000002",
    phone: "+998 90 000 96 02",
    note: null,
  },
  { name: "Sinov Brend (demo)", kind: "BRAND", taxId: null, phone: null, note: null },
  { name: "Sinov Toza (demo)", kind: "BRAND", taxId: null, phone: null, note: null },
  {
    name: "Namuna Qog'oz (demo)",
    kind: "BOTH",
    taxId: "300000003",
    phone: "+998 90 000 96 03",
    note: "Qog'oz va kanselyariya, ulgurji",
  },
  {
    name: "Misol Texnika (demo)",
    kind: "BOTH",
    taxId: "300000004",
    phone: "+998 90 000 96 04",
    note: null,
  },
];

/** Both branches; "Oshxona" in each, as names are unique inside a branch only (04 rule 3). */
export const SEED_DEPARTMENTS = [
  {
    branch: "CHL",
    name: "Oshxona",
    responsibleName: "Dilshod Namunaev",
    responsiblePhone: "+998 90 000 95 01",
  },
  {
    branch: "CHL",
    name: "Kutubxona",
    responsibleName: "Malika Namunaeva",
    responsiblePhone: "+998 90 000 95 02",
  },
  {
    branch: "CHL",
    name: "IT xonasi",
    responsibleName: "Sardor Misolov",
    responsiblePhone: "+998 90 000 95 03",
  },
  {
    branch: "CHL",
    name: "Xo'jalik bo'limi",
    responsibleName: "Kamola Misolova",
    responsiblePhone: "+998 90 000 95 04",
  },
  {
    branch: "YUN",
    name: "Oshxona",
    responsibleName: "Jasur Sinovov",
    responsiblePhone: "+998 90 000 95 05",
  },
  {
    branch: "YUN",
    name: "Sport zali",
    responsibleName: "Feruza Sinovova",
    responsiblePhone: "+998 90 000 95 06",
  },
  {
    branch: "YUN",
    name: "Ma'muriyat",
    responsibleName: "Aziz Namunaev",
    responsiblePhone: "+998 90 000 95 07",
  },
];

/**
 * 30 products: 26 goods and 4 services. A product with `subtypes` gets those real subtypes, each
 * with its own price, and no price of its own (plan of 1.13, decision 1, Look first); any other
 * gets its hidden default subtype holding `price`, which the product holds too, as createProduct
 * writes it (decision 2, Look first). `company` is the default brand or company.
 */
export const SEED_PRODUCTS = [
  // Stationery
  {
    name: "Ruchka",
    category: "Kanselyariya",
    measure: "dona",
    company: "Sinov Brend (demo)",
    subtypes: [
      { name: "Ko'k", price: 2500n },
      { name: "Qora", price: 2500n },
      { name: "Qizil", price: 2500n },
    ],
  },
  {
    name: "Daftar",
    category: "Kanselyariya",
    measure: "dona",
    subtypes: [
      { name: "48 varaq", price: 4000n },
      { name: "96 varaq", price: 7000n },
    ],
  },
  {
    name: "Marker",
    category: "Kanselyariya",
    measure: "dona",
    subtypes: [
      { name: "Doska uchun", price: 9000n },
      { name: "Doimiy", price: 8000n },
      { name: "Matn ajratuvchi", price: 6000n },
    ],
  },
  {
    name: "A4 qog'oz",
    category: "Kanselyariya",
    measure: "quti",
    company: "Namuna Qog'oz (demo)",
    price: 320000n,
    description: "80 g/m², 5 pachka, har birida 500 varaq",
  },
  { name: "Qalam", category: "Kanselyariya", measure: "dona", price: 1500n },
  { name: "Shtrix", category: "Kanselyariya", measure: "dona", price: 7000n },
  { name: "Skotch", category: "Kanselyariya", measure: "dona", price: 6000n },
  { name: "Papka", category: "Kanselyariya", measure: "dona", price: 5000n },
  // Cleaning
  {
    name: "Qo'lqop",
    category: "Tozalash vositalari",
    measure: "dona",
    company: "Sinov Toza (demo)",
    subtypes: [
      { name: "Rezina", price: 12000n },
      { name: "Nitril", price: 15000n },
    ],
  },
  {
    name: "Suyuq sovun",
    category: "Tozalash vositalari",
    measure: "litr",
    company: "Sinov Toza (demo)",
    price: 18000n,
  },
  { name: "Pol yuvish vositasi", category: "Tozalash vositalari", measure: "litr", price: 22000n },
  { name: "Hojatxona qog'ozi", category: "Tozalash vositalari", measure: "quti", price: 95000n },
  { name: "Axlat qopi", category: "Tozalash vositalari", measure: "quti", price: 30000n },
  // Food
  { name: "Guruch", category: "Oziq-ovqat", measure: "kilogramm", price: 16000n },
  { name: "Shakar", category: "Oziq-ovqat", measure: "kilogramm", price: 12000n },
  { name: "Kungaboqar yog'i", category: "Oziq-ovqat", measure: "litr", price: 21000n },
  { name: "Un", category: "Oziq-ovqat", measure: "kilogramm", price: 7000n },
  { name: "Choy", category: "Oziq-ovqat", measure: "quti", price: 28000n },
  // Furniture
  {
    name: "Stul",
    category: "Mebel",
    measure: "dona",
    company: "Namuna Savdo MChJ (demo)",
    subtypes: [
      { name: "O'quvchi", price: 350000n },
      { name: "O'qituvchi", price: 650000n },
      { name: "Ofis", price: 900000n },
    ],
  },
  { name: "Parta", category: "Mebel", measure: "dona", price: 850000n },
  { name: "Doska", category: "Mebel", measure: "dona", price: 1200000n },
  { name: "Javon", category: "Mebel", measure: "dona", price: 1500000n },
  // IT
  {
    name: "Kabel",
    category: "IT jihozlari",
    measure: "dona",
    company: "Misol Texnika (demo)",
    subtypes: [
      { name: "HDMI 2 m", price: 60000n },
      { name: "USB-C 1 m", price: 35000n },
      { name: "Tarmoq kabeli 5 m", price: 25000n },
    ],
  },
  {
    name: "Sichqoncha",
    category: "IT jihozlari",
    measure: "dona",
    company: "Misol Texnika (demo)",
    price: 80000n,
  },
  { name: "Klaviatura", category: "IT jihozlari", measure: "dona", price: 150000n },
  { name: "Printer kartriji", category: "IT jihozlari", measure: "dona", price: 250000n },
  // Services
  {
    name: "Konditsioner tozalash",
    type: "SERVICE",
    category: "Ta'mirlash xizmatlari",
    measure: "xizmat",
    price: 150000n,
  },
  {
    name: "Santexnika ta'miri",
    type: "SERVICE",
    category: "Ta'mirlash xizmatlari",
    measure: "xizmat",
    price: 200000n,
  },
  {
    name: "Elektr ta'miri",
    type: "SERVICE",
    category: "Ta'mirlash xizmatlari",
    measure: "xizmat",
    price: 180000n,
  },
  {
    name: "Kompyuter ta'miri",
    type: "SERVICE",
    category: "Ta'mirlash xizmatlari",
    measure: "xizmat",
    price: 120000n,
    description: "Bitta kompyuter uchun",
  },
];

/** The catalogs in the order seedCatalogs() writes them and reports them. */
export const SEED_CATALOGS = [
  "measures",
  "categories",
  "extra cost types",
  "companies",
  "departments",
  "products",
  "subtypes",
];

/**
 * The advisory table locks every write of a catalog takes before reading names
 * (`hashtextextended(<entity>, 1)`, src/features/catalog/actions/catalog-entries.ts), in one fixed
 * order, products before subtypes as the Excel import (plan of 1.13, decision 7).
 */
const LOCKED_ENTITIES = [
  "units",
  "categories",
  "extra_cost_types",
  "companies",
  "departments",
  "products",
  "product_variants",
];

/** The unique indexes' own key: lower case, trimmed, inner spaces squeezed (04 rule 3). */
const KEY = (column) => `lower(regexp_replace(btrim(${column}), '\\s+', ' ', 'g'))`;
const SAME = (column, parameter) => `${KEY(column)} = ${KEY(parameter)}`;

/** Money in an audit row: its exact decimal text, as auditValue() of src/domain/audit.ts. */
function som(value) {
  return value === null ? null : value.toString();
}

/**
 * Writes what is missing of the seed's catalogs and keeps what is there (plan of 1.13, decisions
 * 4 and 5): an entry is found by its catalog's unique key and never changed; a found product gets
 * nothing added. Refuses, so that the caller writes nothing, a new row that would point at an
 * inactive measure, category, company or branch (decision 6). Runs in the caller's transaction.
 * @param {(text: string, values?: unknown[]) => Promise<{ rows: any[], rowCount: number | null }>} query
 * @param {{ headId: string, branchIds: Map<string, string>, moment: Date }} context
 * @returns {Promise<{ catalog: string, created: number, kept: number }[]>} per catalog, in the order of SEED_CATALOGS
 */
export async function seedCatalogs(query, { headId, branchIds, moment }) {
  for (const entity of LOCKED_ENTITIES) {
    await query("select pg_advisory_xact_lock(hashtextextended($1, 1))", [entity]);
  }
  const outcome = new Map(SEED_CATALOGS.map((catalog) => [catalog, { created: 0, kept: 0 }]));
  const audit = (action, entity, entityId, after) =>
    insertAuditRow(query, {
      actorId: headId,
      action,
      entity,
      entityId,
      before: null,
      after,
      at: moment,
    });

  // Measures: found by name or by short name, both unique (0010; decision 4).
  const measures = new Map();
  for (const measure of SEED_MEASURES) {
    const found = await query(
      `select id, name, is_active from units
        where ${SAME("name", "$1")} or ${SAME("short_name", "$2")}
        order by (${SAME("name", "$1")}) desc limit 1`,
      [measure.name, measure.shortName],
    );
    if (found.rows[0]) {
      measures.set(measure.name, found.rows[0]);
      outcome.get("measures").kept += 1;
      continue;
    }
    const created = await query(
      `insert into units (name, short_name, allow_decimal, is_active, created_at)
       values ($1, $2, $3, true, $4) returning id, name, is_active`,
      [measure.name, measure.shortName, measure.allowDecimal, moment],
    );
    measures.set(measure.name, created.rows[0]);
    await audit("unit.create", "units", created.rows[0].id, {
      name: measure.name,
      shortName: measure.shortName,
      allowDecimal: measure.allowDecimal,
      isActive: true,
    });
    outcome.get("measures").created += 1;
  }

  // Categories and extra cost types: a name only.
  const categories = await keepOrCreateNamed(
    query,
    audit,
    outcome.get("categories"),
    "categories",
    "category.create",
    SEED_CATEGORIES,
    moment,
  );
  await keepOrCreateNamed(
    query,
    audit,
    outcome.get("extra cost types"),
    "extra_cost_types",
    "extra_cost_type.create",
    SEED_EXTRA_COST_TYPES,
    moment,
  );

  const companies = new Map();
  for (const company of SEED_COMPANIES) {
    const found = await query(
      `select id, name, is_active from companies where ${SAME("name", "$1")}`,
      [company.name],
    );
    if (found.rows[0]) {
      companies.set(company.name, found.rows[0]);
      outcome.get("companies").kept += 1;
      continue;
    }
    const created = await query(
      `insert into companies (name, kind, tax_id, phone, note, is_active, created_at)
       values ($1, $2, $3, $4, $5, true, $6) returning id, name, is_active`,
      [company.name, company.kind, company.taxId, company.phone, company.note, moment],
    );
    companies.set(company.name, created.rows[0]);
    await audit("company.create", "companies", created.rows[0].id, {
      name: company.name,
      kind: company.kind,
      taxId: company.taxId,
      phone: company.phone,
      note: company.note,
      isActive: true,
    });
    outcome.get("companies").created += 1;
  }

  // Departments: found by branch and name (0011).
  for (const department of SEED_DEPARTMENTS) {
    const branchId = branchIds.get(department.branch);
    const found = await query(
      `select id from departments where branch_id = $1 and ${SAME("name", "$2")}`,
      [branchId, department.name],
    );
    if (found.rows[0]) {
      outcome.get("departments").kept += 1;
      continue;
    }
    const branch = await query("select is_active from branches where id = $1 for share", [
      branchId,
    ]);
    if (!branch.rows[0].is_active) {
      throw new Error(
        `Refused: the branch ${department.branch} is inactive; the department "${department.name}" cannot be added to it. Nothing was written.`,
      );
    }
    const created = await query(
      `insert into departments (branch_id, name, responsible_name, responsible_phone, is_active, created_at)
       values ($1, $2, $3, $4, true, $5) returning id`,
      [branchId, department.name, department.responsibleName, department.responsiblePhone, moment],
    );
    await audit("department.create", "departments", created.rows[0].id, {
      branchId,
      branch: department.branch,
      name: department.name,
      responsibleName: department.responsibleName,
      responsiblePhone: department.responsiblePhone,
      isActive: true,
    });
    outcome.get("departments").created += 1;
  }

  for (const product of SEED_PRODUCTS) {
    const found = await query(`select id from products where ${SAME("name", "$1")}`, [
      product.name,
    ]);
    if (found.rows[0]) {
      outcome.get("products").kept += 1;
      // Kept whole (decision 5, as the review changed it): nothing is added; each listed subtype
      // found under it counts as kept.
      for (const subtype of product.subtypes ?? []) {
        const held = await query(
          `select 1 from product_variants
            where product_id = $1 and not is_default and ${SAME("name", "$2")}`,
          [found.rows[0].id, subtype.name],
        );
        if (held.rowCount !== 0) outcome.get("subtypes").kept += 1;
      }
      continue;
    }
    const category = usable("category", categories.get(product.category), product);
    const measure = usable("measure", measures.get(product.measure), product);
    const company = product.company
      ? usable("company", companies.get(product.company), product)
      : null;
    const withSubtypes = product.subtypes !== undefined;
    const price = withSubtypes ? null : product.price;
    const type = product.type ?? "GOODS";
    const description = product.description ?? null;
    const created = await query(
      `insert into products (name, type, category_id, unit_id, default_company_id, reference_price,
         description, has_variants, is_active, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, true, $9) returning id`,
      [
        product.name,
        type,
        category.id,
        measure.id,
        company?.id ?? null,
        price,
        description,
        withSubtypes,
        moment,
      ],
    );
    const productId = created.rows[0].id;
    await audit("product.create", "products", productId, {
      name: product.name,
      type,
      categoryId: category.id,
      unitId: measure.id,
      defaultCompanyId: company?.id ?? null,
      referencePrice: som(price),
      description,
      photoFileId: null,
      isActive: true,
      category: category.name,
      unit: measure.name,
      defaultCompany: company?.name ?? null,
      photo: null,
    });
    outcome.get("products").created += 1;

    if (!withSubtypes) {
      // The hidden default subtype holds the product's price (04 rule 1), with its HEAD row.
      const variant = await query(
        `insert into product_variants (product_id, name, is_default, reference_price, created_at)
         values ($1, 'default', true, $2, $3) returning id`,
        [productId, price, moment],
      );
      await recordHeadPrice(query, variant.rows[0].id, price, headId, moment);
      continue;
    }
    for (const subtype of product.subtypes) {
      const variant = await query(
        `insert into product_variants (product_id, name, is_default, reference_price, created_at)
         values ($1, $2, false, $3, $4) returning id`,
        [productId, subtype.name, subtype.price, moment],
      );
      const variantId = variant.rows[0].id;
      await recordHeadPrice(query, variantId, subtype.price, headId, moment);
      await audit("subtype.create", "product_variants", variantId, {
        productId,
        product: product.name,
        name: subtype.name,
        referencePrice: som(subtype.price),
        photoFileId: null,
        photo: null,
        isActive: true,
      });
      outcome.get("subtypes").created += 1;
    }
  }

  return SEED_CATALOGS.map((catalog) => ({ catalog, ...outcome.get(catalog) }));
}

/** The HEAD row of a price the Head set, with no note (plan of 1.9, decision 1). */
async function recordHeadPrice(query, variantId, price, headId, moment) {
  await query(
    `insert into price_history (variant_id, price, source, note, set_by, created_at)
     values ($1, $2, 'HEAD', null, $3, $4)`,
    [variantId, price, headId, moment],
  );
}

/** A found or created entry a new product points at, refused when inactive (04 rule 2). */
function usable(what, entry, product) {
  if (!entry.is_active) {
    throw new Error(
      `Refused: the ${what} "${entry.name}" is inactive; the product "${product.name}" cannot use it. Nothing was written.`,
    );
  }
  return entry;
}

/** Categories and extra cost types: found by name, or created with their audit row. */
async function keepOrCreateNamed(query, audit, counts, table, action, names, moment) {
  const entries = new Map();
  for (const name of names) {
    const found = await query(
      `select id, name, is_active from ${table} where ${SAME("name", "$1")}`,
      [name],
    );
    if (found.rows[0]) {
      entries.set(name, found.rows[0]);
      counts.kept += 1;
      continue;
    }
    const created = await query(
      `insert into ${table} (name, is_active, created_at) values ($1, true, $2)
       returning id, name, is_active`,
      [name, moment],
    );
    entries.set(name, created.rows[0]);
    await audit(action, table, created.rows[0].id, { name, isActive: true });
    counts.created += 1;
  }
  return entries;
}
