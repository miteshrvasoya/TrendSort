# Unit economics methodology (v0.5.0)

Pure functions in `packages/shared/src/economics.ts` (unit-tested against hand-computed numbers). The web calculator runs them live; the API recomputes on save. Every input is editable. **Duty and fee defaults are indicative placeholders** until you verify them (CBIC / ICEGATE tariff with your CHA; your seller portal for fees).

## Import landed cost (Indian customs valuation)

`CIF = FOB·fx + weight·freight/kg + insurance% · FOB` (customs assumes 1.125% insurance when unknown)
`AV = CIF · (1 + landing charges 1%)` (the 1% only inflates the duty base; it is not a cash cost)
`BCD = AV · BCD%`, `SWS = BCD · 10%`, `Other = AV · other%`, `IGST = (AV + BCD + SWS + Other) · IGST%`
`Landed (ex-IGST) = CIF + BCD + SWS + Other + clearance per shipment ÷ MOQ`

## Per unit, any route

- Revenue ex-GST = price ÷ (1 + GST%).
- Fees = (referral% · gross price + closing fee + fulfilment fee), ×(1 + 18%) if you are not GST-registered.
- If GST-registered, IGST on imports, GST on inputs and GST on fees are claimable (ITC) and excluded from cost; IGST still ties up cash at the border.
- Ads = ad% · revenue. Returns = return rate · (return shipping + write-off% · unit cost).
- Contribution = revenue − unit cost − packaging − other − fees − ads − returns. Margin = contribution ÷ revenue.

## Routes

- **Import**: as above. Fixed = certification + samples. Lead time default 84 days.
- **Manufacture**: unit cost = (BOM + conversion)·(1 + defect%) + inbound freight (+ input GST if unregistered). Fixed = tooling + certification. Lead time default 45 days.
- **Hybrid**: import landed + local finishing; sold at your price premium (default 0%); fixed = import fixed + finishing setup; lead time = import + finishing days.

## Outputs

Break-even units = ⌈fixed ÷ contribution⌉ (never if contribution ≤ 0). Working capital = first-order cash (units × cost incl. IGST paid up front, plus packaging). ROI = first-order profit ÷ working capital. Planned profit = contribution · planned units − fixed.

## Recommendation

A route is ruled out if it loses money, is below your minimum margin, exceeds your days available (lead time) or your cash budget. Among the rest, the highest planned profit wins; **skip** if none survive. The reasons list the numbers and what ruled the others out.

## Into the score

`margin component = clamp(margin% ÷ 35 · 100)` of the best route; `price fit = 100` if the selling price is within the gift price range, falling to 0 at 150% of its top. Regulatory ease and logistics come from the saved India fit attributes (`docs/SCORING.md`). Margin below ~5% (component < 15) caps Opportunity at 49.

## India fit checks

A checklist of things to verify (voltage and plug, BIS CRS, WPC, batteries, FSSAI, CDSCO, water type and RO fit, cultural and colour fit, labelling, import policy, trademark/design). Each names who to confirm with. Not legal advice. Attributes start from keyword heuristics (clearly marked "inferred") and **only attributes you save feed the score**.

## Reviews

Imported by you (no automatic review fetching). Rule-based theme counting, once per review, negation-aware, with short example snippets and improvement hints. Under 20 reviews is flagged as a hint, not a finding.
