// Koren-style spelling of Hebrew terms in English text: ḥ for ח, a final ה
// written as "a" (hashkava, mitzva), HaShana. Only listed words change, matched
// whole, so English words ("school", "much") and people's and places' names
// (official spellings) are left alone.
const TERMS = {
  // Months
  Cheshvan: 'Ḥeshvan', Heshvan: 'Ḥeshvan', Marcheshvan: 'Marḥeshvan', Marheshvan: 'Marḥeshvan',
  "Sh'vat": 'Shevat', Shvat: 'Shevat', Iyyar: 'Iyar', Tamuz: 'Tammuz', Teveth: 'Tevet',
  // Festivals and days
  Hanukkah: 'Ḥanukka', Hanukah: 'Ḥanukka', Chanukah: 'Ḥanukka', Chanukkah: 'Ḥanukka',
  Pesach: 'Pesaḥ', Simchat: 'Simḥat', 'Rosh Hashanah': 'Rosh HaShana', 'Rosh HaShanah': 'Rosh HaShana',
  "Tisha B'Av": 'Tisha BeAv', 'Tu Bishvat': 'Tu BiShvat', "Tu B'Shvat": 'Tu BiShvat', Chag: 'Ḥag',
  Sukkah: 'Sukka', sukkah: 'sukka', Havdalah: 'Havdala', havdalah: 'havdala',
  // Learning and observance
  mitzvah: 'mitzva', Mitzvah: 'Mitzva', cheder: 'ḥeder', Cheder: 'Ḥeder', heder: 'ḥeder',
  Chumash: 'Ḥumash', chumash: 'ḥumash', Mishnah: 'Mishna', mishnah: 'mishna', Tanach: 'Tanakh',
  halacha: 'halakha', Halacha: 'Halakha', halakhah: 'halakha', Halakhah: 'Halakha', halachic: 'halakhic',
  Haggadah: 'Haggada', Megillah: 'Megilla', chazan: 'ḥazan', chazzan: 'ḥazan', chuppah: 'ḥuppa',
  challah: 'ḥalla', chevruta: 'ḥavruta', havruta: 'ḥavruta', Chabad: 'Ḥabad', Hasidic: 'Ḥasidic',
  Chassidic: 'Ḥasidic', hasidic: 'ḥasidic', 'Chevra Kadisha': 'Ḥevra Kadisha', 'Hevra Kadisha': 'Ḥevra Kadisha',
  hashkavah: 'hashkava', Hatikvah: 'HaTikva', Hatikva: 'HaTikva',
  // Pre-state and army
  Haganah: 'Hagana', Palmach: 'Palmaḥ', Palmah: 'Palmaḥ', Lechi: 'Leḥi', Lehi: 'Leḥi',
  aliyah: 'aliya', Aliyah: 'Aliya', Machal: 'Maḥal',
};

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = new RegExp(`(?<![\\p{L}'’])(${Object.keys(TERMS).sort((a, b) => b.length - a.length).map(escape).join('|')})(?![\\p{L}])`, 'gu');

export const koren = (text) => (text ? text.replace(pattern, (m) => TERMS[m]) : text);
