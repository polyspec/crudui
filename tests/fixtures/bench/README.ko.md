# 벤치마크 인자 fixture

[English](README.md).

`iteration-arguments.json`은 `tools/bench/run.js`와 JavaScript·PHP·Go·Rust 벤치마크 드라이버가
받거나 거부하는 반복 횟수를 담습니다. 반복 횟수는 1~8자리 10진수이며, `--iters`는 1부터,
`--warmup`은 0부터 둘 다 10000000까지입니다. 모든 프로그램은 값이 없는 경우를 포함해 그 밖의 값을
검증기를 불러오기 전에 거부하고, 사례의 `message`를 표준 오류에 출력한 뒤 종료 상태 2로 끝납니다.

`rejected`는 인자 쌍과 메시지를 나열합니다. `accepted`는 가장 작은 반복 횟수로 `contact` fixture를
한 번 실행하는 사례이며, 보고에는 그 스펙과 반복 횟수가 있어야 합니다.

`tests/build/bench-drivers.test.mjs`가 모든 사례를 모든 프로그램에 실행합니다
(`npm run test:bench`).
