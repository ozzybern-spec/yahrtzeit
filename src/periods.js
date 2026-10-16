// Wars and periods, by Gregorian date of death (inclusive ranges).
// The Ministry of Defense and National Insurance lists do not record how
// someone died, so the war filter is based on these official date ranges only.
export const PERIODS = [
  { key: 'prestate', he: 'טרום המדינה', en: 'Before statehood', to: '1947-11-29' },
  { key: 'independence', he: 'מלחמת העצמאות', en: 'War of Independence', from: '1947-11-30', to: '1949-07-20' },
  { key: 'sinai', he: 'מבצע קדש', en: 'Sinai Campaign', from: '1956-10-29', to: '1956-11-05' },
  { key: 'sixday', he: 'מלחמת ששת הימים', en: 'Six-Day War', from: '1967-06-05', to: '1967-06-10' },
  { key: 'attrition', he: 'מלחמת ההתשה', en: 'War of Attrition', from: '1969-03-08', to: '1970-08-07' },
  { key: 'yomkippur', he: 'מלחמת יום הכיפורים', en: 'Yom Kippur War', from: '1973-10-06', to: '1973-10-24' },
  { key: 'lebanon1', he: 'מלחמת לבנון הראשונה', en: 'First Lebanon War', from: '1982-06-06', to: '1985-06-10' },
  { key: 'intifada1', he: 'האינתיפאדה הראשונה', en: 'First Intifada', from: '1987-12-09', to: '1993-09-13' },
  { key: 'intifada2', he: 'האינתיפאדה השנייה', en: 'Second Intifada', from: '2000-09-29', to: '2005-02-08' },
  { key: 'lebanon2', he: 'מלחמת לבנון השנייה', en: 'Second Lebanon War', from: '2006-07-12', to: '2006-08-14' },
  { key: 'castlead', he: 'מבצע עופרת יצוקה', en: 'Operation Cast Lead', from: '2008-12-27', to: '2009-01-18' },
  { key: 'pillar', he: 'מבצע עמוד ענן', en: 'Operation Pillar of Defense', from: '2012-11-14', to: '2012-11-21' },
  { key: 'protectiveedge', he: 'מבצע צוק איתן', en: 'Operation Protective Edge', from: '2014-07-08', to: '2014-08-26' },
  { key: 'swords', he: 'מלחמת חרבות ברזל', en: 'Swords of Iron War', from: '2023-10-07' },
];

export const OTHER = { key: 'other', he: 'בין המלחמות', en: 'Between wars' };

/** Period for an ISO date ('YYYY-MM-DD'); ISO strings compare correctly as text. */
export function periodOf(iso) {
  return PERIODS.find((p) => (!p.from || iso >= p.from) && (!p.to || iso <= p.to)) || OTHER;
}
