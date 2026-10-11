import { describe, expect, it } from "vitest";
import { friendlyError, isNetworkError, NETWORK_ERROR_MESSAGE } from "./networkErrors";

describe("isNetworkError", () => {
  it("reconhece as mensagens dos navegadores", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new TypeError("Load failed"))).toBe(true);
    expect(isNetworkError(new TypeError("NetworkError when attempting to fetch resource."))).toBe(true);
    expect(isNetworkError({ message: "net::ERR_INTERNET_DISCONNECTED" })).toBe(true);
  });
  it("reconhece o erro de fetch do supabase-js", () => {
    const err = Object.assign(new Error("x"), { name: "AuthRetryableFetchError", status: 0 });
    expect(isNetworkError(err)).toBe(true);
    expect(isNetworkError({ status: 0, message: "" })).toBe(true);
  });
  it("não confunde com erros de aplicação", () => {
    expect(isNetworkError(new Error("Invalid login credentials"))).toBe(false);
    expect(isNetworkError({ status: 400, message: "bad" })).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
});

describe("friendlyError", () => {
  it("troca só erros de rede", () => {
    expect(friendlyError(new TypeError("Load failed"), "padrão")).toBe(NETWORK_ERROR_MESSAGE);
    expect(friendlyError(new Error("outro"), "padrão")).toBe("padrão");
  });
});
