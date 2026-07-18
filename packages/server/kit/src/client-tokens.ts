// The client-credentials token source now lives in the shared, zero-dep
// @iedora/service-tokens package (menu + tutor both consumed a copy). Re-exported
// here so menu services keep importing it from @iedora/menu-kit unchanged.
export { ServiceTokenSource } from "@iedora/service-tokens";
