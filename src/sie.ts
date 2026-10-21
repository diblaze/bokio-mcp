// SIE 4 export parser and the pure computations behind the computed tools.
// Money is integer öre inside; public functions return kronor (ore / 100) once.
// Sign is the ledger's: debit positive, credit negative.

export interface SieLine {
    account: number;
    amount: number; // öre
}

export interface SieVer {
    series: string;
    number: string;
    date: string; // YYYY-MM-DD
    text: string;
    cancelled: boolean;
    lines: SieLine[];
}

export interface Sie {
    from: string;
    to: string;
    accounts: Map<number, string>;
    ib: Map<number, number>;
    ub: Map<number, number>;
    vers: SieVer[];
}

// ---- money -----------------------------------------------------------------

/** "-1234.5" -> -123450 öre, by string split (no float). */
export function toOre(text: string): number {
    const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
    if (!m) throw new Error(`not an amount with at most two decimals: ${text}`);
    const ore = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
    return m[1] ? -ore : ore;
}

export const fromOre = (ore: number): number => ore / 100;

// ---- decoding and parsing --------------------------------------------------

// CP437 bytes 0x80-0xFF. Node's TextDecoder has no ibm437.
const CP437_HIGH =
    "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";

export function decodeSie(buf: Buffer): string {
    if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf)
        return buf.subarray(3).toString("utf8");
    const latin = buf.toString("latin1");
    if (!/^#FORMAT\s+PC8\b/m.test(latin)) return latin;
    let out = "";
    for (const b of buf) out += b < 0x80 ? String.fromCharCode(b) : CP437_HIGH[b - 0x80];
    return out;
}

const STR = String.raw`"(?:[^"\\]|\\.)*"|\S+`;
const BAL = /^#(?:IB|UB)\s+0\s+(\d+)\s+(-?[\d.]+)/;
// Only year index 0 (the exported year) is kept; other #RAR/#IB/#UB indices are skipped.
const PATTERNS: Record<string, RegExp> = {
    "#RAR": /^#RAR\s+0\s+(\d{8})\s+(\d{8})/,
    "#KONTO": new RegExp(String.raw`^#KONTO\s+(\d+)\s+(${STR})`),
    "#IB": BAL,
    "#UB": BAL,
    "#VER": new RegExp(String.raw`^#VER\s+(${STR})\s+(${STR})\s+(\d{8})(?:\s+(${STR}))?`),
    "#TRANS": /^#TRANS\s+(\d+)\s+\{[^}]*\}\s+(-?[\d.]+)/,
};
const unquote = (s = "") => (s.startsWith('"') ? s.slice(1, -1).replace(/\\"/g, '"') : s);
const isoDate = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

export function parseSie(buf: Buffer): Sie {
    const s: Sie = {
        from: "",
        to: "",
        accounts: new Map(),
        ib: new Map(),
        ub: new Map(),
        vers: [],
    };
    let cur: SieVer | undefined;
    for (const raw of decodeSie(buf).split(/\r?\n/)) {
        const line = raw.trim();
        const tag = line.split(/\s/, 1)[0];
        const m = PATTERNS[tag]?.exec(line);
        if (!m) continue;
        if (tag === "#RAR") {
            s.from = isoDate(m[1]);
            s.to = isoDate(m[2]);
        } else if (tag === "#KONTO") {
            s.accounts.set(Number(m[1]), unquote(m[2]));
        } else if (tag === "#IB" || tag === "#UB") {
            (tag === "#IB" ? s.ib : s.ub).set(Number(m[1]), toOre(m[2]));
        } else if (tag === "#VER") {
            cur = {
                series: unquote(m[1]),
                number: unquote(m[2]),
                date: isoDate(m[3]),
                text: unquote(m[4]),
                cancelled: false,
                lines: [],
            };
            s.vers.push(cur);
        } else if (cur) {
            cur.lines.push({ account: Number(m[1]), amount: toOre(m[2]) });
        }
    }
    if (!s.from) throw new Error("SIE export has no #RAR line (fiscal-year range)");
    markAnnulments(s.vers);
    return s;
}

const lineKey = (l: SieLine[], sign: number) =>
    l
        .map((x) => `${x.account}:${x.amount * sign}`)
        .sort()
        .join(",");

/** "Annullering av V7: ..." whose lines negate V7 cancels both. */
export function markAnnulments(vers: SieVer[]): void {
    const byId = new Map(vers.map((v) => [`${v.series}${v.number}`, v]));
    for (const v of vers) {
        const target = byId.get(/^Annullering av (\S+):/.exec(v.text)?.[1] ?? "");
        if (target && lineKey(target.lines, -1) === lineKey(v.lines, 1)) {
            target.cancelled = true;
            v.cancelled = true;
        }
    }
}

// ---- shared ----------------------------------------------------------------

export interface DatedLine extends SieLine {
    date: string;
    series: string;
    number: string;
    text: string;
    cancelled: boolean;
    index: number;
}

/** Every line of the loaded years, sorted by date, series, number, line order. */
export function allLines(sies: Sie[]): DatedLine[] {
    const out: DatedLine[] = [];
    for (const s of sies)
        for (const v of s.vers)
            v.lines.forEach((l, index) => {
                out.push({
                    ...l,
                    date: v.date,
                    series: v.series,
                    number: v.number,
                    text: v.text,
                    cancelled: v.cancelled,
                    index,
                });
            });
    return out.sort(
        (a, b) =>
            a.date.localeCompare(b.date) ||
            a.series.localeCompare(b.series) ||
            Number(a.number) - Number(b.number) ||
            a.number.localeCompare(b.number) ||
            a.index - b.index,
    );
}

/** Result accounts (classes 3-8) carry no opening balance. */
const opening = (s: Sie, account: number) => (account >= 3000 ? 0 : (s.ib.get(account) ?? 0));

const nameOf = (sies: Sie[], account: number) =>
    sies.map((s) => s.accounts.get(account)).find((n) => n !== undefined) ?? "";

function yearOf(sies: Sie[], date: string): Sie {
    const s = sies.find((x) => x.from <= date && date <= x.to);
    if (!s) throw new Error(`${date} is outside the loaded fiscal years`);
    return s;
}

// ---- balances and ledger ---------------------------------------------------

export function balancesAt(sies: Sie[], date: string, accounts?: number[]) {
    const s = yearOf(sies, date);
    const moves = new Map<number, number>();
    for (const v of s.vers)
        if (v.date <= date)
            for (const l of v.lines) moves.set(l.account, (moves.get(l.account) ?? 0) + l.amount);
    const want = accounts ? new Set(accounts) : new Set([...s.ib.keys(), ...moves.keys()]);
    return [...want]
        .sort((a, b) => a - b)
        .map((account) => {
            const o = opening(s, account);
            const m = moves.get(account) ?? 0;
            return {
                account,
                name: nameOf(sies, account),
                opening: fromOre(o),
                movement: fromOre(m),
                balance: fromOre(o + m),
            };
        });
}

/**
 * Lines on one account in [from, to] with running balance. At each fiscal-year start
 * the balance restarts from that year's opening (#IB 0; 0 for result accounts), so
 * result accounts reset and balance accounts follow the export, not a carried sum.
 */
export function ledger(sies: Sie[], account: number, fromDate: string, to: string) {
    const ordered = [...sies].sort((a, b) => a.from.localeCompare(b.from));
    // Nothing is known before the first loaded year: start the range there.
    const from = fromDate < ordered[0].from ? ordered[0].from : fromDate;
    const lines = allLines(ordered).filter((l) => l.account === account);
    let year = ordered.find((s) => s.to >= from) as Sie;
    let bal =
        opening(year, account) +
        lines.filter((l) => l.date >= year.from && l.date < from).reduce((n, l) => n + l.amount, 0);
    const open = bal;
    const out = lines
        .filter((l) => l.date >= from && l.date <= to)
        .map((l) => {
            if (l.date > year.to) {
                year = yearOf(ordered, l.date);
                bal = opening(year, account);
            }
            bal += l.amount;
            return {
                date: l.date,
                series: l.series,
                number: l.number,
                text: l.text,
                amount: fromOre(l.amount),
                balance: fromOre(bal),
                cancelled: l.cancelled,
            };
        });
    // The range may end in a later year with no lines yet: close from that year's opening.
    const end = ordered.find((s) => s.from <= to && to <= s.to) ?? ordered[ordered.length - 1];
    if (end.from > year.to) bal = opening(end, account);
    return {
        account,
        name: nameOf(sies, account),
        from,
        to,
        opening: fromOre(open),
        closing: fromOre(bal),
        lines: out,
    };
}

// ---- duplicates and bank reconciliation ------------------------------------

const DAY = 86_400_000;
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const verId = (l: DatedLine) => `${l.series}${l.number}`;
const ref = (l: DatedLine) => ({ date: l.date, series: l.series, number: l.number, text: l.text });

/** Same account + amount from different verifications within windowDays of each other. */
export function duplicates(
    sies: Sie[],
    from: string,
    to: string,
    windowDays: number,
    account?: number,
) {
    const groups = new Map<string, DatedLine[]>();
    for (const l of allLines(sies)) {
        if (l.cancelled || l.amount === 0 || l.date < from || l.date > to) continue;
        if (account !== undefined && l.account !== account) continue;
        const k = `${l.account}:${l.amount}`;
        groups.set(k, [...(groups.get(k) ?? []), l]);
    }
    const out: { account: number; amount: number; lines: ReturnType<typeof ref>[] }[] = [];
    for (const ls of groups.values()) {
        let cluster: DatedLine[] = [];
        const flush = () => {
            if (new Set(cluster.map(verId)).size > 1)
                out.push({
                    account: cluster[0].account,
                    amount: fromOre(cluster[0].amount),
                    lines: cluster.map(ref),
                });
        };
        for (const l of ls) {
            if (cluster.length && dayDiff(cluster[cluster.length - 1].date, l.date) > windowDays) {
                flush();
                cluster = [];
            }
            cluster.push(l);
        }
        flush();
    }
    return out.sort(
        (a, b) =>
            a.account - b.account ||
            a.amount - b.amount ||
            a.lines[0].date.localeCompare(b.lines[0].date),
    );
}

export interface BankRow {
    date: string;
    amount: number; // kronor
    text?: string;
}

/**
 * Match bank rows to ledger lines (one account, not cancelled) by exact öre amount
 * within toleranceDays. Rows go in date order and each takes the earliest unmatched
 * reachable line (then lowest verification number): a line an earlier row could use
 * is never left for a later row that cannot reach it, so a statement that reconciles
 * shows no false breaks. Each ledger line is used at most once. Unmatched lines are
 * reported only inside the statement's own date span; margin lines count only when
 * a row matched them.
 */
export function reconcile(lines: DatedLine[], rows: BankRow[], toleranceDays: number) {
    const sorted = [...rows].sort(
        (a, b) =>
            a.date.localeCompare(b.date) ||
            a.amount - b.amount ||
            (a.text ?? "").localeCompare(b.text ?? ""),
    );
    const free = new Set(lines);
    const matched: {
        bank: BankRow;
        ledger: ReturnType<typeof ref> & { amount: number };
        dayDiff: number;
    }[] = [];
    const unmatchedBank: BankRow[] = [];
    const used: DatedLine[] = [];
    for (const r of sorted) {
        const ore = Math.round(r.amount * 100);
        const best = [...free]
            .filter((l) => l.amount === ore && Math.abs(dayDiff(r.date, l.date)) <= toleranceDays)
            .sort((a, b) => a.date.localeCompare(b.date) || Number(a.number) - Number(b.number))[0];
        if (!best) {
            unmatchedBank.push(r);
            continue;
        }
        free.delete(best);
        used.push(best);
        matched.push({
            bank: r,
            ledger: { ...ref(best), amount: fromOre(best.amount) },
            dayDiff: Math.abs(dayDiff(r.date, best.date)),
        });
    }
    const first = sorted[0]?.date ?? "";
    const last = sorted[sorted.length - 1]?.date ?? "";
    const inSpan = (l: DatedLine) => l.date >= first && l.date <= last;
    // Totals: lines inside the statement span plus margin lines a row matched.
    const inside = lines.filter((l) => inSpan(l) || !free.has(l));
    const left = lines.filter((l) => inSpan(l) && free.has(l));
    const out = (l: DatedLine) => ({ ...ref(l), amount: fromOre(l.amount) });
    const ledgerOre = inside.reduce((n, l) => n + l.amount, 0);
    const bankOre = rows.reduce((n, r) => n + Math.round(r.amount * 100), 0);
    return {
        matched,
        unmatchedBank,
        unmatchedLedger: left.map(out),
        // Duplicates are looked for in the whole window, margin included.
        suspectedDuplicates: lines
            .filter((l) => free.has(l))
            .filter((l) =>
                used.some(
                    (u) =>
                        u.amount === l.amount && Math.abs(dayDiff(u.date, l.date)) <= toleranceDays,
                ),
            )
            .map(out),
        bankTotal: fromOre(bankOre),
        ledgerTotal: fromOre(ledgerOre),
        difference: fromOre(ledgerOre - bankOre),
    };
}

// ---- period sums: VAT and profit and loss ----------------------------------

function periodSums(sies: Sie[], from: string, to: string, pick: (account: number) => boolean) {
    const sums = new Map<number, number>();
    for (const l of allLines(sies))
        if (l.date >= from && l.date <= to && pick(l.account))
            sums.set(l.account, (sums.get(l.account) ?? 0) + l.amount);
    return [...sums].sort((a, b) => a[0] - b[0]);
}

const sumWhere = (rows: [number, number][], lo: number, hi: number) =>
    rows.filter(([a]) => a >= lo && a <= hi).reduce((n, [, v]) => n + v, 0);

/**
 * VAT (2610-2659) and sales (3000-3999) accounts for a period. No tax-return boxes.
 * Settlement verifications (any line on 2650) are left out: they move the quarter's
 * VAT into 2650 and would net the period to zero.
 */
export function vatSummary(sies: Sie[], from: string, to: string) {
    const activity = sies.map((s) => ({
        ...s,
        vers: s.vers.filter((v) => !v.lines.some((l) => l.account === 2650)),
    }));
    const rows = periodSums(
        activity,
        from,
        to,
        (a) => (a >= 2610 && a <= 2659) || (a >= 3000 && a <= 3999),
    );
    const output = -sumWhere(rows, 2610, 2639);
    const input = sumWhere(rows, 2640, 2649);
    return {
        from,
        to,
        accounts: rows.map(([account, v]) => ({
            account,
            name: nameOf(sies, account),
            amount: fromOre(v),
        })),
        outputVat: fromOre(output),
        inputVat: fromOre(input),
        netVat: fromOre(output - input),
    };
}

const CLASS_NAMES: Record<string, string> = {
    "3": "Revenue",
    "4": "Goods and materials",
    "5": "Other external costs",
    "6": "Other external costs",
    "7": "Personnel and depreciation",
    "8": "Financial items and tax",
};

/**
 * Result accounts (3000-8999) per BAS class or account; result = -sum (profit positive).
 * The year-end closing verification (any line on 2099, booking 8999 against it) is left
 * out: it offsets the whole result and would net a closed year to zero.
 */
export function profitAndLoss(sies: Sie[], from: string, to: string, groupBy: "class" | "account") {
    const activity = sies.map((s) => ({
        ...s,
        vers: s.vers.filter((v) => !v.lines.some((l) => l.account === 2099)),
    }));
    const rows = periodSums(activity, from, to, (a) => a >= 3000 && a <= 8999);
    const grouped = new Map<string, number>();
    for (const [a, v] of rows) {
        const key = groupBy === "class" ? String(a).charAt(0) : String(a);
        grouped.set(key, (grouped.get(key) ?? 0) + v);
    }
    return {
        from,
        to,
        rows: [...grouped].map(([key, v]) => ({
            key,
            name: groupBy === "class" ? CLASS_NAMES[key] : nameOf(sies, Number(key)),
            amount: fromOre(v),
        })),
        result: fromOre(-rows.reduce((n, [, v]) => n + v, 0)),
    };
}

// ---- open items -------------------------------------------------------------

/**
 * Open items on one account up to asOf: postings carry the account's normal sign
 * (debit for 1xxx, credit for 2xxx); each payment (opposite sign) settles the
 * earliest unpaid posting of the same amount dated on or before it (FIFO, exact
 * öre). Annulled verifications are skipped; the oldest loaded #IB is reported as
 * an unitemised opening amount.
 */
export function openItems(sies: Sie[], account: number, asOf: string) {
    const ordered = [...sies].sort((a, b) => a.from.localeCompare(b.from));
    const ib = opening(ordered[0], account);
    const lines = allLines(ordered).filter((l) => l.account === account && l.date <= asOf);
    const live = lines.filter((l) => !l.cancelled);
    // Assets (1xxx) are posted as debits, liabilities (2xxx) as credits; the IB may have either sign.
    const sign = account < 2000 ? 1 : -1;
    const open: DatedLine[] = [];
    const unmatched: DatedLine[] = [];
    for (const l of live) {
        if (Math.sign(l.amount) === sign) {
            open.push(l);
            continue;
        }
        const i = open.findIndex((o) => o.amount === -l.amount && o.date <= l.date);
        if (i >= 0) open.splice(i, 1);
        else unmatched.push(l);
    }
    const out = (l: DatedLine) => ({ ...ref(l), amount: fromOre(l.amount) });
    return {
        account,
        asOf,
        openingUnitemised: fromOre(ib),
        open: open.map((l) => ({ ...out(l), ageDays: dayDiff(l.date, asOf) })),
        unmatchedPayments: unmatched.map(out),
        balance: fromOre(ib + lines.reduce((n, l) => n + l.amount, 0)),
    };
}
