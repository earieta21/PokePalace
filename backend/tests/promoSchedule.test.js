import { test } from "node:test";
import assert from "node:assert/strict";
import { PROMO_WEEKDAYS, isComboPalaceDay, isPromo2x1Day } from "../utils/promoSchedule.js";

// Una semana completa, a mediodía en Tijuana (19:00 UTC), empezando en domingo.
const WEEK = Array.from({ length: 7 }, (_, day) => new Date(Date.UTC(2026, 10, 15 + day, 19)));

test("los días que enseña el kiosco son justo los días en que corre cada promo", () => {
  WEEK.forEach((date, weekday) => {
    assert.equal(PROMO_WEEKDAYS.promo2x1.includes(weekday), isPromo2x1Day(date), `2x1, día ${weekday}`);
    assert.equal(PROMO_WEEKDAYS.comboPalace.includes(weekday), isComboPalaceDay(date), `combo, día ${weekday}`);
  });
  assert.deepEqual([...PROMO_WEEKDAYS.promo2x1], [2, 4]);
  assert.deepEqual([...PROMO_WEEKDAYS.comboPalace], [1, 3, 5]);
});
