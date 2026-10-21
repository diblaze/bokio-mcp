import { describe, expect, it } from "vitest";
import {
    allLines,
    balancesAt,
    duplicates,
    ledger,
    parseSie,
    reconcile,
    toOre,
} from "../src/sie.js";

// Synthetic export mirroring Bokio's layout: CRLF, PC8, several #RAR years,
// #TRANS lines without date or text (they take the #VER's). Invented data only.
function sie(body: string[], head: string[] = []): Buffer {
    return Buffer.from(
        [
            "#FLAGGA 0",
            '#PROGRAM "Test" 1.0',
            "#FORMAT PC8",
            "#SIETYP 4",
            "#RAR 0 20260101 20261231",
            "#RAR -1 20250101 20251231",
            '#KONTO 1930 "Bank"',
            '#KONTO 2440 "Leverantorsskulder"',
            '#KONTO 3011 "Forsaljning"',
            ...head,
            ...body,
            "",
        ].join("\r\n"),
        "latin1",
    );
}

function ver(series: string, n: number, date: string, text: string, lines: [number, string][]) {
    return [
        `#VER "${series}" "${n}" ${date} "${text}" ${date}`,
        "{",
        ...lines.map(([a, amt]) => `\t#TRANS ${a} {} ${amt}`),
        "}",
    ];
}

describe("SIE parsing", () => {
    it("decodes PC8 account names (PC8 text decoded)", () => {
        // 0x86 å, 0x84 ä, 0x94 ö in CP437
        const name = Buffer.from([0x4b, 0x86, 0x84, 0x94]); // "Kåäö"
        const buf = Buffer.concat([
            sie([]),
            Buffer.from('#KONTO 6000 "', "latin1"),
            name,
            Buffer.from('"\r\n', "latin1"),
        ]);
        expect(parseSie(buf).accounts.get(6000)).toBe("Kåäö");
    });

    it("lines take the verification date (Lines take the verification date)", () => {
        const s = parseSie(
            sie(
                ver("V", 1, "20260305", "Sale", [
                    [1930, "100.00"],
                    [3011, "-100.00"],
                ]),
            ),
        );
        expect(s.vers[0].date).toBe("2026-03-05");
        expect(s.vers[0].lines).toEqual([
            { account: 1930, amount: 10000 },
            { account: 3011, amount: -10000 },
        ]);
    });

    it("uses year index 0 only (Only year index 0 balances are used)", () => {
        const s = parseSie(sie([], ["#IB -1 1930 999.00", "#IB 0 1930 50.00", "#UB -1 1930 1.00"]));
        expect(s.from).toBe("2026-01-01");
        expect(s.to).toBe("2026-12-31");
        expect(s.ib.get(1930)).toBe(5000);
        expect(s.ub.has(1930)).toBe(false);
    });

    it("annulment nets to zero and is flagged (Annulment pair nets to zero in balances and is flagged in the ledger)", () => {
        const s = parseSie(
            sie(
                [
                    ...ver("V", 7, "20260310", "Fee", [
                        [1930, "-40.00"],
                        [2440, "40.00"],
                    ]),
                    ...ver("V", 8, "20260310", "Annullering av V7: Fee", [
                        [1930, "40.00"],
                        [2440, "-40.00"],
                    ]),
                ],
                ["#IB 0 1930 100.00"],
            ),
        );
        expect(balancesAt([s], "2026-12-31", [1930])[0].balance).toBe(100);
        const l = ledger([s], 1930, "2026-01-01", "2026-12-31");
        expect(l.lines.map((x) => x.cancelled)).toEqual([true, true]);
        expect(l.closing).toBe(100);
    });

    it("annulment text without negated lines is not an annulment", () => {
        const s = parseSie(
            sie([
                ...ver("V", 7, "20260310", "Fee", [[1930, "-40.00"]]),
                ...ver("V", 8, "20260310", "Annullering av V7: Fee", [[1930, "-40.00"]]),
            ]),
        );
        expect(s.vers.map((v) => v.cancelled)).toEqual([false, false]);
    });

    it("rejects an export without #RAR (Malformed export is rejected)", () => {
        expect(() => parseSie(Buffer.from("#FLAGGA 0\r\n#SIETYP 4\r\n"))).toThrow(/#RAR/);
    });

    it("sums öre exactly (Sum of many öre amounts is exact)", () => {
        expect(toOre("-1234.5")).toBe(-123450);
        expect(() => toOre("1.234")).toThrow();
        const s = parseSie(
            sie(
                ["0.10", "0.10", "0.10", "0.70"].flatMap((a, i) =>
                    ver("V", i + 1, "20260102", "x", [[1930, a]]),
                ),
            ),
        );
        expect(balancesAt([s], "2026-12-31", [1930])[0].balance).toBe(1);
    });
});

describe("balances and ledger", () => {
    const s = () =>
        parseSie(
            sie(
                [
                    ...ver("V", 1, "20260201", "In", [
                        [1930, "300.00"],
                        [3011, "-300.00"],
                    ]),
                    ...ver("V", 2, "20260601", "Out", [
                        [1930, "-50.00"],
                        [2440, "50.00"],
                    ]),
                    ...ver("V", 3, "20260901", "Late", [
                        [1930, "25.00"],
                        [3011, "-25.00"],
                    ]),
                ],
                [
                    "#IB 0 1930 1000.00",
                    "#IB 0 2440 -50.00",
                    "#UB 0 1930 1275.00",
                    "#UB 0 2440 0.00",
                ],
            ),
        );

    it("balance at a mid-year date (Balance at a mid-year date equals opening plus movements to date)", () => {
        const [row] = balancesAt([s()], "2026-06-30", [1930]);
        expect(row).toEqual({
            account: 1930,
            name: "Bank",
            opening: 1000,
            movement: 250,
            balance: 1250,
        });
    });

    it("balance at year end equals #UB (Balance at fiscal year end equals the closing balance in the export)", () => {
        const x = s();
        const rows = balancesAt([x], "2026-12-31", [1930, 2440]);
        expect(rows.map((r) => Math.round(r.balance * 100))).toEqual([
            x.ub.get(1930),
            x.ub.get(2440),
        ]);
    });

    it("accounts filter (Accounts filter limits output and keeps order)", () => {
        const rows = balancesAt([s()], "2026-12-31", [2440, 1930]);
        expect(rows.map((r) => r.account)).toEqual([1930, 2440]);
        // result accounts open at zero, and appear without a filter
        const all = balancesAt([s()], "2026-12-31");
        expect(all.find((r) => r.account === 3011)).toMatchObject({ opening: 0, balance: -325 });
    });

    it("ledger resets at a new fiscal year (Result account restarts at the new fiscal year)", () => {
        const y25 = parseSie(
            Buffer.from(
                [
                    "#FORMAT PC8",
                    "#RAR 0 20250101 20251231",
                    '#VER "V" "1" 20251215 "Dec sale" 20251215',
                    "{",
                    "\t#TRANS 3011 {} -500.00",
                    "}",
                    "",
                ].join("\r\n"),
                "latin1",
            ),
        );
        const y26 = parseSie(sie(ver("V", 1, "20260110", "Jan sale", [[3011, "-200.00"]])));
        const l = ledger([y26, y25], 3011, "2025-12-01", "2026-01-31");
        expect(l.lines.map((x) => x.balance)).toEqual([-500, -200]);
        // A new year with no lines yet still closes from its own opening.
        const empty26 = parseSie(sie([]));
        expect(ledger([empty26, y25], 3011, "2025-12-01", "2026-01-31").closing).toBe(0);
        // A range starting before the first loaded year starts at that year.
        expect(ledger([empty26], 3011, "2025-06-01", "2026-01-31").from).toBe("2026-01-01");
    });

    it("ledger order and running balance (Ledger lines carry running balance in deterministic order)", () => {
        const x = parseSie(
            sie(
                [
                    ...ver("V", 12, "20260301", "B", [[1930, "-10.00"]]),
                    ...ver("V", 3, "20260301", "A", [[1930, "-5.00"]]),
                    ...ver("A", 9, "20260301", "C", [[1930, "1.00"]]),
                ],
                ["#IB 0 1930 100.00"],
            ),
        );
        const l = ledger([x], 1930, "2026-03-01", "2026-03-31");
        expect(l.opening).toBe(100);
        expect(l.lines.map((r) => [r.series, r.number, r.balance])).toEqual([
            ["A", "9", 101],
            ["V", "3", 96],
            ["V", "12", 86],
        ]);
        expect(l.closing).toBe(86);
    });
});

describe("duplicates", () => {
    const dup = (body: string[]) =>
        duplicates([parseSie(sie(body))], "2026-01-01", "2026-12-31", 7);

    it("groups same amount within window (Same amount on the same account within the window is grouped)", () => {
        const g = dup([
            ...ver("V", 1, "20260301", "Fee", [[1930, "-99.00"]]),
            ...ver("V", 2, "20260304", "Fee", [[1930, "-99.00"]]),
        ]);
        expect(g).toEqual([
            {
                account: 1930,
                amount: -99,
                lines: [
                    { date: "2026-03-01", series: "V", number: "1", text: "Fee" },
                    { date: "2026-03-04", series: "V", number: "2", text: "Fee" },
                ],
            },
        ]);
    });

    it("one verification is not its own duplicate (Lines of one verification are not duplicates of each other)", () => {
        expect(
            dup(
                ver("V", 1, "20260301", "Split", [
                    [1930, "-50.00"],
                    [1930, "-50.00"],
                ]),
            ),
        ).toEqual([]);
    });

    it("equal amounts outside the window (Equal amounts outside the window are not grouped)", () => {
        expect(
            dup([
                ...ver("V", 1, "20260301", "Rent", [[1930, "-500.00"]]),
                ...ver("V", 2, "20260331", "Rent", [[1930, "-500.00"]]),
            ]),
        ).toEqual([]);
    });
});

describe("bank reconciliation", () => {
    const book = (body: string[]) =>
        allLines([parseSie(sie(body))]).filter((l) => l.account === 1930 && !l.cancelled);
    const row = (date: string, amount: number, text = "") => ({ date, amount, text });

    it("reconcile takes the earliest reachable line (Exact amount within tolerance matches the earliest reachable line)", () => {
        const r = reconcile(
            book([
                ...ver("V", 1, "20260312", "Far", [[1930, "-10.00"]]),
                ...ver("V", 2, "20260309", "Near", [[1930, "-10.00"]]),
            ]),
            [row("2026-03-07", -10), row("2026-03-12", 99)],
            7,
        );
        expect(r.matched.map((m) => [m.ledger.number, m.dayDiff])).toEqual([["2", 2]]);
        expect(r.unmatchedLedger.map((l) => l.number)).toEqual(["1"]);
    });

    it("reconcile tie goes to the earlier line (Tie on date distance resolves to the earliest ledger line)", () => {
        const r = reconcile(
            book([
                ...ver("V", 1, "20260311", "After", [[1930, "-10.00"]]),
                ...ver("V", 2, "20260309", "Before", [[1930, "-10.00"]]),
            ]),
            [row("2026-03-10", -10)],
            3,
        );
        expect(r.matched[0].ledger.date).toBe("2026-03-09");
    });

    it("reconcile matches a ledger line once (A ledger line is matched at most once)", () => {
        const r = reconcile(
            book(ver("V", 1, "20260310", "One", [[1930, "-10.00"]])),
            [row("2026-03-10", -10, "a"), row("2026-03-10", -10, "b")],
            3,
        );
        expect(r.matched).toHaveLength(1);
        expect(r.unmatchedBank).toEqual([row("2026-03-10", -10, "b")]);
    });

    it("reconcile reports unmatched and difference (Unmatched rows on both sides and net difference are reported)", () => {
        const r = reconcile(
            book([
                ...ver("V", 1, "20260310", "Both", [[1930, "-10.00"]]),
                ...ver("V", 2, "20260311", "Books only", [[1930, "-0.30"]]),
            ]),
            [row("2026-03-10", -10), row("2026-03-12", 5.1)],
            3,
        );
        expect(r.unmatchedBank).toEqual([row("2026-03-12", 5.1)]);
        expect(r.unmatchedLedger.map((l) => l.number)).toEqual(["2"]);
        expect([r.ledgerTotal, r.bankTotal, r.difference]).toEqual([-10.3, -4.9, -5.4]);
    });

    it("reconcile flags suspected duplicates (Suspected duplicate ledger lines are flagged)", () => {
        const r = reconcile(
            book([
                ...ver("V", 1, "20260310", "Fee", [[1930, "-25.00"]]),
                ...ver("V", 2, "20260311", "Fee again", [[1930, "-25.00"]]),
            ]),
            [row("2026-03-10", -25), row("2026-03-11", 7)],
            3,
        );
        expect(r.suspectedDuplicates.map((l) => l.number)).toEqual(["2"]);
    });

    it("recurring amount reconciles fully (Recurring same amount reconciles fully)", () => {
        const r = reconcile(
            book([
                ...ver("V", 1, "20260303", "Fee", [[1930, "-9.00"]]),
                ...ver("V", 2, "20260306", "Fee", [[1930, "-9.00"]]),
            ]),
            [row("2026-03-05", -9), row("2026-03-07", -9)],
            3,
        );
        expect(r.matched).toHaveLength(2);
        expect([r.unmatchedBank, r.unmatchedLedger, r.difference]).toEqual([[], [], 0]);
    });

    it("double booking in the margin is still flagged", () => {
        const r = reconcile(
            book([
                ...ver("V", 1, "20260309", "Fee", [[1930, "-25.00"]]),
                ...ver("V", 2, "20260309", "Fee again", [[1930, "-25.00"]]),
            ]),
            [row("2026-03-10", -25)],
            3,
        );
        expect(r.matched).toHaveLength(1);
        expect(r.suspectedDuplicates).toHaveLength(1);
        expect(r.unmatchedLedger).toEqual([]);
    });

    it("margin lines are not reported (Lines outside the statement span are not reported)", () => {
        const r = reconcile(
            book([
                ...ver("V", 1, "20260308", "Before statement", [[1930, "-3.00"]]),
                ...ver("V", 2, "20260310", "In statement", [[1930, "-10.00"]]),
            ]),
            [row("2026-03-10", -10)],
            3,
        );
        expect([r.unmatchedLedger, r.ledgerTotal, r.difference]).toEqual([[], -10, 0]);
    });

    it("annulled pairs skip matching (Annulled pairs are excluded from duplicate and reconciliation matching)", () => {
        const body = [
            ...ver("V", 1, "20260310", "Fee", [[1930, "-25.00"]]),
            ...ver("V", 2, "20260310", "Fee", [[1930, "-25.00"]]),
            ...ver("V", 3, "20260310", "Annullering av V2: Fee", [[1930, "25.00"]]),
        ];
        expect(duplicates([parseSie(sie(body))], "2026-01-01", "2026-12-31", 7)).toEqual([]);
        const r = reconcile(book(body), [row("2026-03-10", -25)], 3);
        expect(r.matched.map((m) => m.ledger.number)).toEqual(["1"]);
        expect(r.unmatchedLedger).toEqual([]);
    });
});
