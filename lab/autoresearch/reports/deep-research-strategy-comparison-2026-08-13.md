# Сравнение intraday Forex-стратегий из Deep Research

Дата исследования: 2026-08-13
Статус: development evidence, не разрешение на live-торговлю

## Решение

Ни одну стратегию нельзя сейчас включать в live.

Для следующего полностью независимого forward-теста приоритет меняется относительно исходного Deep Research:

1. `AUDJPY_OVERLAP_M15_H1_EMA_MACD_BODY_RUNNER` — лучший кандидат для наблюдения. Он слабее по общей доходности, чем некоторые post-hoc варианты A, но заметно лучше переносит умеренное ухудшение spread и entry execution.
2. `AUDJPY_ASIA_M1_DAY_PULLBACK_V1` — оставить как второй benchmark, а не как текущего фаворита. Номинальный результат положительный, но edge разрушается уже при небольшом cost stress.
3. Level-фильтры — не принимать по этому development-периоду. Round-room 0.25 ATR улучшил validation, но не решил cost fragility; previous-session 1 ATR дал лучший aggregate, но не прошёл validation-week gate и является post-hoc выбором.
4. Opening-range/«50 pips», FX-fix reversal и fixed-2R overlap — отклонить.
5. Historical news blackout не оценивался: в snapshot нет point-in-time календаря публикаций. Подмена его современным календарём внесла бы look-ahead bias.

## Протокол

- Локальный read-only snapshot: `/private/tmp/capital-dataset-snapshot-2026-08-11`, 2.6 GB.
- 17 полных FX-наборов, таймфреймы M1/M5/M15/H1/H4/D1.
- Основной период: ISO W07–W32 2026, то есть 26 недель уже просмотренного development evidence.
- Train: W07–W19; validation: W20–W32.
- Стартовый капитал: EUR 500.
- Risk: 1% на позицию; не более 15% открытого portfolio risk; sizing ограничен margin и leverage 30:1 majors / 20:1 crosses.
- Исполнение: только закрытые свечи, следующая M1 либо pending fill, historical bid/ask, SL-first при неоднозначной M1 OHLC, weekday entries, same-day flat.
- Dataset fingerprint основного 17-pair набора: `8c6e2db3731911af94f3f75af67657b4452676c7980aaa661edaa1381ce939f1`.
- Frozen evaluator основного нового прогона: `1ba0aab1554bb485df9c676bf9362ceaa01b861c8e67e73f6836bb98103546af`.

Сервер не использовался для вычислений и не изменялся. Live-код, broker session, orders и PM2 не запускались и не изменялись.

## Контроль воспроизводимости

Архивный same-day отчёт показывал +22.89%, PF 1.124 и 408 входов при evaluator SHA `548f6227...`. Точная версия этого uncommitted evaluator отсутствует в Git history. Новый frozen evaluator воспроизводит ту же спецификацию как +20.46%, PF 1.110 и 406 входов.

Поэтому +22.89% остаётся только архивным результатом, а не результатом нового теста. Все сравнения ниже используют единый новый evaluator. Расхождение 2 входа и EUR 12.14 не скрывается и само по себе показывает, почему стратегия ещё не готова к переносу в live.

## Основные результаты

| Стратегия | Баланс | Return | PF | Входы | Train R | Validation R | Max DD | Последние 2 недели | Решение |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| AUDJPY Asia M1 day pullback A | 602.30 | +20.46% | 1.110 | 406 | +15.806 | +4.681 | 10.9% | -15.35 | Только forward benchmark |
| AUDJPY overlap body-runner B | 595.28 | +19.06% | 1.303 | 118 | +15.707 | +3.005 | 6.0% | -31.68, 0/7 wins | Лучший forward-кандидат, не live |
| AUDJPY overlap fixed 2R | 563.05 | +12.61% | 1.181 | 112 | +17.068 | -5.148 | 8.4% | -31.68, 0/7 wins | Отклонить |
| GMT 07:00 range OCO, 2R | 520.95 | +4.19% | 1.026 | 648 | +0.097 | +9.571 | 25.8% | +38.28 | Отклонить: PF/DD/weeks |
| London-local 07:00 range OCO, 2R | 412.60 | -17.48% | 0.904 | 649 | -27.800 | -10.436 | 23.6% | +2.14 | Отклонить |
| London close-confirmed breakout, 2R | 452.00 | -9.60% | 0.974 | 778 | -6.491 | -4.420 | 33.8% | +65.44 | Отклонить |

Положительный recent отрезок у opening-range не меняет решения: полные train и/или validation folds, PF и drawdown не проходят. Выбирать вариант по последним двум неделям после просмотра было бы regime cherry-picking.

## Candidate A: устойчивость параметров и costs

Проверено 48 комбинаций:

- day move: 0.03 / 0.05 / 0.08 / 0.10 M15 ATR;
- stop: 1.25 / 1.50 / 1.75 ATR;
- hold: 60 / 90 / 120 / 180 минут.

Результат plateau слабый:

- 16 из 48 были положительны одновременно в train и validation;
- только 5 из 48 дополнительно имели PF >= 1.10 и max drawdown <= 12R;
- median PF = 1.039;
- median validation = -6.108R;
- 60- и 90-минутные варианты в основном разрушали edge;
- post-hoc лучший сбалансированный вариант `day=0.10, stop=1.5, hold=120` дал +22.10%, PF 1.118, train +10.439R, validation +11.685R и DD 9.931R, но выбирать его теперь для live нельзя: он найден после просмотра validation.

### A: execution stress

| Stress | Return | PF | Validation R | Вывод |
|---|---:|---:|---:|---|
| Baseline | +20.46% | 1.110 | +4.681 | Номинально положительно |
| Spread ×1.25 | -5.98% | 0.973 | -10.654 | Edge разрушен |
| Spread ×1.50 | -14.47% | 0.924 | -19.970 | Отклонить |
| Spread ×2.00 | -23.67% | 0.867 | -30.482 | Отклонить |
| Entry slippage 0.05R | -11.82% | 0.940 | -14.669 | Edge разрушен |
| Entry slippage 0.10R | -31.13% | 0.822 | -25.786 | Edge разрушен |
| Stop slippage 0.05R | +11.92% | 1.061 | -0.020 | Validation уже не положителен |
| Stop slippage 0.10R | +3.02% | 1.016 | -4.720 | Edge разрушен |

Entry delay 1–2 минуты случайно улучшал aggregate (+23.17%/+23.52%), но 1-minute validation был отрицательным, а выбирать задержку как «улучшение» после просмотра результата нельзя.

## Candidate B: fixed target, runner и costs

Runner действительно улучшил exact entry family: fixed 2R потерял -5.148R в validation, body-gated runner получил +3.005R. Это подтверждает направление исходного Deep Research, но результат остаётся development-selected.

| Stress runner B | Return | PF | Validation R | Вывод |
|---|---:|---:|---:|---|
| Baseline | +19.06% | 1.303 | +3.005 | Номинально лучший |
| Spread ×1.25 | +17.12% | 1.270 | +2.121 | Переносит умеренный stress |
| Spread ×1.50 | +11.03% | 1.169 | +0.198R / -EUR 0.45 | Практически нулевой validation |
| Spread ×2.00 | +5.43% | 1.080 | -4.557 | Edge разрушен |
| Entry slippage 0.02R | +15.90% | 1.249 | +0.719 | Ещё положительно |
| Entry slippage 0.05R | +14.06% | 1.224 | -0.859 | Validation отрицателен |
| Stop slippage 0.05R | +14.94% | 1.224 | +0.905 | Ещё положительно |
| Stop slippage 0.10R | +10.78% | 1.151 | -1.195 | Validation отрицателен |

Главный риск B — regime decay: последние две недели дали -EUR 31.68, PF 0 и 7 стопов из 7 сделок. До нового независимого периода это неотличимо от исчезнувшего edge.

## Level-фильтры

New York Fed исследования дают причинное основание тестировать круглые уровни: stop-loss/take-profit orders кластеризовались около round numbers; stop-loss мог усиливать пробой, take-profit — reversal. Но историческое обоснование не гарантирует улучшение конкретной AUDJPY-стратегии.

| Вариант A | Return | PF | Validation R | DD R | Комментарий |
|---|---:|---:|---:|---:|---|
| Baseline | +20.46% | 1.110 | +4.681 | 10.138 | Контроль |
| Round room 0.25 ATR | +21.31% | 1.115 | +7.483 | 11.687 | Лучший predeclared round вариант, но costs не решены |
| Round room 0.50 ATR | +23.19% | 1.126 | +4.947 | 14.356 | Провал DD и validation weeks |
| Round room 1.00 ATR | +16.18% | 1.088 | +0.494 | 15.300 | Хуже |
| Previous-session room 1.00 ATR | +26.17% | 1.145 | +11.107 | 9.993 | Post-hoc лидер; validation positive weeks 46.2% |
| Round + session room 0.50 ATR | +7.66% | 1.041 | -5.164 | 16.273 | Отклонить |

Вывод: фильтр 0.25 ATR можно заморозить как отдельную forward-гипотезу рядом с A, но нельзя объявлять улучшением на основании этого уже просмотренного периода.

## Opening range / «50 pips a day»

Проверены literal 07:00–08:00 GMT OCO, Europe/London DST-aware диапазон, ATR-stop и M15 close-confirmed breakout на всех 17 парах, максимум пять одновременных позиций.

Лучший aggregate — GMT OCO 2R: +4.19%, PF 1.026, max DD 30.707R / 25.8%; positive weeks только 46.2% и в train, и в validation. Вариант 1R потерял -20.26%; ATR-stop 2R потерял -34.85%. Семейство отклонено.

## FX-fix reversal

Проверена retail liquidity-taking реализация: купить USD против USD-quoted валют после Tokyo 09:55, ECB 14:15 Frankfurt и London 16:00, затем time exit 30/60 минут; historical bid/ask и 1.5 ATR protection.

| Fix | 30 минут | 60 минут |
|---|---:|---:|
| Tokyo | -20.12%, PF 0.750 | -33.60%, PF 0.647 |
| ECB | -15.46%, PF 0.919 | -12.24%, PF 0.935 |
| London | -31.17%, PF 0.689 | -25.31%, PF 0.763 |

Все варианты отклонены. Это согласуется с опубликованным результатом Krohn, Mueller и Whelan: наблюдаемый fix reversal не превращается в положительную unconditional стратегию для клиента, который забирает ликвидность, после transaction costs; прибыльность относится к liquidity provision.

## Что не моделировалось

- Point-in-time historical macro calendar и news blackout.
- Broker minimum deal size, minimum stop distance и market-specific dealing rules.
- Gap execution, financing/overnight charges и guaranteed-stop premium.
- Latency distribution и slippage как функция новости/ликвидности; stress задан механически в R или spread multiplier.
- Tick order flow и централизованный volume: FX candle volume не является биржевым tape.
- Независимый locked test: W07–W32 уже просмотрены в прежних исследованиях.

## Следующий честный эксперимент

Не подбирать больше параметры на W07–W32. Заморозить до открытия новых данных три профиля:

1. B runner без level-filter;
2. A baseline;
3. A + round-room 0.25 M15 ATR.

Forward protocol: минимум 8–12 новых недель, historical bid/ask, broker-rule preflight, сохранение каждой отвергнутой сделки, nominal и spread ×1.25 параллельно, без изменения параметров. Решение о demo probation принимать только после положительного independent forward и ручной сверки backtest/live signal identity.

## Evidence и источники

- Машинный основной отчёт: `deep-research-strategy-comparison-2026-08-13.json`.
- Cost stress B: `deep-research-overlap-stress-2026-08-13.json`.
- Архивный A: `same-day-simple-17fx-autoresearch-20min-2026-08-11.json`.
- Архивный B: `m15-greenred-h1-trend-runner-diagnostic-v5-2026-08-12.json`.
- Carol Osler, New York Fed, *Currency Orders and Exchange-Rate Dynamics*: https://www.newyorkfed.org/research/staff_reports/sr125.html
- Carol Osler, New York Fed, *Support for Resistance*: https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf
- Carol Osler, New York Fed, *Stop-Loss Orders and Price Cascades*: https://www.newyorkfed.org/research/staff_reports/sr150.html
- Krohn, Mueller, Whelan, *Foreign Exchange Fixings and Returns around the Clock*: https://onlinelibrary.wiley.com/doi/full/10.1111/jofi.13306
- Capital.com, rules and caveats for the 07:00 GMT benchmark: https://capital.com/en-int/learn/trading-strategies/50-pips-a-day-forex-strategy
