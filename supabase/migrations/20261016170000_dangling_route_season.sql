-- 党岭三湖：推荐季节收窄到彩林季（10 月中旬至 11 月），霜降前后常有大雪。
update routes
set best_months = '{10,11}',
    season_note = '10月中旬至11月彩林最佳；霜降前后常有大雪，之后海子结冰'
where id = 'trk008';
