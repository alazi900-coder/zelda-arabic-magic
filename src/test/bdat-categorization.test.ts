import { describe, it, expect } from "vitest";
import { categorizeBdatTable } from "@/components/editor/types";

describe("categorizeBdatTable - table name prefixes", () => {
  it("classifies MNU_ tables as menu", () => {
    expect(categorizeBdatTable("MNU_ShopList[0].Msg_Name")).toBe("bdat-menu");
  });
  it("classifies BTL_ tables as battle", () => {
    expect(categorizeBdatTable("BTL_Arts[5].Name")).toBe("bdat-battle");
  });
  it("classifies QST_ tables as quest", () => {
    expect(categorizeBdatTable("QST_List[10].Title")).toBe("bdat-quest");
  });
  it("classifies FLD_MapInfo as field", () => {
    expect(categorizeBdatTable("FLD_MapInfo[2].Name")).toBe("bdat-field");
  });
  it("classifies ITM_ tables as item", () => {
    expect(categorizeBdatTable("ITM_Weapon[3].Name")).toBe("bdat-item");
  });
  it("classifies msg_mnu_ as menu", () => {
    expect(categorizeBdatTable("msg_mnu_option[0].caption")).toBe("bdat-menu");
  });
  it("classifies EVT_ as story", () => {
    expect(categorizeBdatTable("EVT_Scene[1].Text")).toBe("bdat-story");
  });
  it("classifies DLC_ as dlc", () => {
    expect(categorizeBdatTable("DLC_Quest[0].Name")).toBe("bdat-dlc");
  });
});

describe("categorizeBdatTable - column name fallback (smart classification)", () => {
  it("classifies unknown table with Window column as menu", () => {
    expect(categorizeBdatTable("UnknownTable[0].WindowTitle")).toBe("bdat-menu");
  });
  it("classifies hex-hash table with task column as quest", () => {
    expect(categorizeBdatTable("0xABCD1234[3].TaskUI")).toBe("bdat-quest");
  });
  it("classifies unknown table with landmark column as field", () => {
    expect(categorizeBdatTable("SomeTable[1].LandmarkName")).toBe("bdat-field");
  });
  it("classifies unknown table with weapon column as item", () => {
    expect(categorizeBdatTable("SomeTable[5].WeaponType")).toBe("bdat-item");
  });
  it("classifies unknown table with voice column as settings", () => {
    expect(categorizeBdatTable("SomeTable[0].VoiceVolume")).toBe("bdat-settings");
  });
  it("classifies unknown table with BtnCaption as menu", () => {
    expect(categorizeBdatTable("RandomHash[2].BtnCaption")).toBe("bdat-menu");
  });
  it("returns other for truly unknown entries", () => {
    expect(categorizeBdatTable("0xDEADBEEF[0].0xFACEFEED")).toBe("other");
  });
  it("returns other for unrecognizable labels", () => {
    expect(categorizeBdatTable("Unknown[0].SomeRandomCol")).toBe("other");
  });
});
