import { categoryUpdate, itemWrite, menuUpdate } from "@iedora/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import type { MenuDeps } from "../../deps.ts";
import type { MenuEnv } from "../../middleware.ts";
import {
  createCategory,
  createItem,
  createMenu,
  deleteCategory,
  deleteItem,
  deleteMenu,
  reorderCategories,
  reorderItems,
  updateCategory,
  updateItem,
  updateMenu,
} from "../../service.ts";

// Local-only payloads with no contract equivalent. The menu/category/item write
// schemas (menuUpdate/categoryUpdate/itemWrite) come from @iedora/contracts — the
// single source the React client is typed against — so the route can't drift.
const nameInput = z.object({ name: z.string() });
const orderInput = z.object({ orderedIds: z.array(z.string()) });

// Scoped builder slice: the menu→category→item CRUD + reorder under
// /restaurants/{slug}. Relies on the parent `scoped` middleware; reads the
// restaurant (id + default language) from context.
export function builderRoutes(deps: MenuDeps) {
  const rid = (c: { get: (k: "restaurant") => { id: string; defaultLanguage: string; defaultCurrency: string } }) =>
    c.get("restaurant");

  return new Hono<MenuEnv>()
    .post("/menus", zValidator("json", nameInput), async (c) =>
      c.json({ id: await createMenu(deps, rid(c).id, c.req.valid("json").name) }),
    )
    .patch("/menus/:menuID", zValidator("json", menuUpdate), async (c) => {
      const r = rid(c);
      await updateMenu(deps, c.req.param("menuID"), r.id, r.defaultLanguage, c.req.valid("json"));
      return c.json({ ok: true });
    })
    .delete("/menus/:menuID", async (c) => {
      await deleteMenu(deps, c.req.param("menuID"), rid(c).id);
      return c.json({ ok: true });
    })
    .put("/menus/:menuID/category-order", zValidator("json", orderInput), async (c) => {
      await reorderCategories(deps, c.req.param("menuID"), rid(c).id, c.req.valid("json").orderedIds);
      return c.json({ ok: true });
    })
    .post("/menus/:menuID/categories", zValidator("json", nameInput), async (c) =>
      c.json({ id: await createCategory(deps, c.req.param("menuID"), rid(c).id, c.req.valid("json").name) }),
    )
    .patch("/categories/:categoryID", zValidator("json", categoryUpdate), async (c) => {
      const r = rid(c);
      await updateCategory(deps, c.req.param("categoryID"), r.id, r.defaultLanguage, c.req.valid("json"));
      return c.json({ ok: true });
    })
    .delete("/categories/:categoryID", async (c) => {
      await deleteCategory(deps, c.req.param("categoryID"), rid(c).id);
      return c.json({ ok: true });
    })
    .put("/categories/:categoryID/item-order", zValidator("json", orderInput), async (c) => {
      await reorderItems(deps, c.req.param("categoryID"), rid(c).id, c.req.valid("json").orderedIds);
      return c.json({ ok: true });
    })
    .post("/categories/:categoryID/items", zValidator("json", itemWrite), async (c) =>
      c.json({
        id: await createItem(
          deps,
          c.req.param("categoryID"),
          rid(c).id,
          rid(c).defaultLanguage,
          rid(c).defaultCurrency,
          c.req.valid("json"),
        ),
      }),
    )
    .patch("/items/:itemID", zValidator("json", itemWrite), async (c) => {
      const r = rid(c);
      await updateItem(deps, c.req.param("itemID"), r.id, r.defaultLanguage, r.defaultCurrency, c.req.valid("json"));
      return c.json({ ok: true });
    })
    .delete("/items/:itemID", async (c) => {
      await deleteItem(deps, c.req.param("itemID"), rid(c).id);
      return c.json({ ok: true });
    });
}
