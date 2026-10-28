# 13. Configurable region, with a US demo lodge

## Context

Orbit was built around a Czech guesthouse: prices in crowns per person, Czech VAT included in every price, a guest book that records everyone in the room (Czech law), and Prague time. The hackathon is judged in the US, where hotels quote a room rate in dollars and add occupancy and sales taxes on the bill, check the ID of the guest who booked, and write dates as "Oct 28" and times as "3 PM". The Czech setup must keep working for the guesthouse Orbit is meant for.

## Decision

- **Rates** carry the `currency` (USD, EUR or CZK), the `pricingBasis` (`per_room`, or `per_person` with child discounts) and the `tax` setup: `inclusive` (prices include tax, as with VAT) or `exclusive` (taxes added on the bill), with a name and a rate (two decimals) for the lodging and the other bracket. With `exclusive` the bill adds one tax line per bracket, worked out once from the bracket's total. The local per-guest tax has a configurable name. Rates saved before this read as the Czech setup.
- **The hotel profile** carries its `country` and working `language`. The country sets the guest-book rules: in the US only the guest who booked shows an ID; elsewhere the Czech rules apply to everyone in the room. The language is where new staff and guests start.
- **The time zone** is a deployment setting (`HOTEL_TIMEZONE`, default `America/Los_Angeles`), set once at startup: a hotel doesn't move, and "today" is needed synchronously everywhere.
- **The web app** writes money, dates and times from those settings (US style for a US hotel). The model is told the currency, the basis and whether taxes are extra, and writes times the way the hotel's guests do.
- **The demo seed** has two presets (`SEED_REGION`): `us`, the default, a fictional mountain lodge in the Sierra Nevada with an English-speaking team and per-room dollar rates with taxes on top; and `cz`, the Czech guesthouse. Guests stay multinational in both.

## Consequences

- Amounts are still whole units of one currency, never converted: switching the currency in Settings changes how numbers read, not their value.
- The US rates, extras and taxes are illustrative values for a fictional property; the Czech placeholders keep their `TODO(David)` markers.
- Existing tests describe the Czech setup and seed with `cz`; the US paths have their own tests and the evals run the agent on the US rates.
