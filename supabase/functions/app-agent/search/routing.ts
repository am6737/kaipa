export type SearchPurpose = 'guide' | 'transport';

// Backstop for old clients/model calls that have no explicit purpose field.
export function searchPurpose(query: string, purpose?: SearchPurpose): SearchPurpose {
  if (purpose === 'transport' || /12306|高铁|动车|火车|列车|车票|车次|余票|航班|机票|飞机|航空|机场|班车|客运|接驳|末班|时刻|铁路|拼车|包车|出租车|网约车|\b(?:[GDCZTK]\d{1,4}|flight|airfare|airline|airport|train|railway|timetable|shuttle|transfer|carpool)\b/i.test(query)) return 'transport';
  return 'guide';
}
