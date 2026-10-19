import { test } from 'node:test';
import assert from 'node:assert/strict';
import { koren } from '../src/koren.js';

test('Koren spelling of Hebrew terms', () => {
  assert.equal(koren('Born on 8 Cheshvan, he made aliyah and joined the Palmach.'), 'Born on 8 Ḥeshvan, he made aliya and joined the Palmaḥ.');
  assert.equal(koren("Rosh Hashanah and Simchat Torah; the Haganah's men"), "Rosh HaShana and Simḥat Torah; the Hagana's men");
  assert.equal(koren("Sh'vat"), 'Shevat');
});

test('English words and names are left alone', () => {
  assert.equal(koren('His school, much loved. Chaim Menachem from Petah Tikva.'), 'His school, much loved. Chaim Menachem from Petah Tikva.');
  assert.equal(koren('Hagananah Palmachim'), 'Hagananah Palmachim');
});
