<?php
declare(strict_types=1);
require __DIR__ . '/repository.php';

function check(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}
function formData(array $state, string $mode): array
{
    return json_decode(json_encode(FormRepository::loadData($state, $mode), JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
}

foreach (['original', 'keyed'] as $mode) {
    $file = sys_get_temp_dir() . '/polyspec-repository-' . bin2hex(random_bytes(6)) . '.json';
    $repo = new FormRepository($file);
    try {
        $before = $repo->read();
        $data = FormRepository::normalize(formData($before, $mode), $mode);
        $saved = $repo->save($data, $mode);
        check($saved['storage'] === $before, "$mode: save must preserve every loaded value and ID");
        $second = new FormRepository($file);
        check($second->read() === $before, "$mode: a new repository instance must load the same file");
        $reversed = $before;
        foreach (['companies', 'stores', 'departments'] as $table) $reversed[$table] = array_reverse($reversed[$table]);
        check(formData($reversed, $mode) === formData($before, $mode), "$mode: loading must use stored positions rather than physical record order");

        $company = array_values($data['companies'])[0];
        if ($mode === 'original') {
            $company['company_seq'] = '';
            $data['companies'][] = $company;
        } else $data['companies']['__abcdef0123456__'] = $company;
        $rejected = false;
        try { $repo->save($data, $mode); } catch (InvalidArgumentException) { $rejected = true; }
        check($rejected, "$mode: existing child cannot use another parent");
        check($repo->read() === $before, "$mode: rejected transaction must preserve the file");

        $repo->save(['companies' => []], $mode);
        $empty = $repo->read();
        check($empty['companies'] === [] && $empty['stores'] === [] && $empty['departments'] === [], "$mode: full deletion must remove descendants");
        check($empty['next'] === $before['next'], "$mode: full deletion must retain sequence counters");
        $loaded = FormRepository::loadData($empty, $mode);
        check($mode === 'keyed' ? $loaded['companies'] instanceof stdClass : $loaded['companies'] === [], "$mode: empty JSON collection type");

        $row = ['name' => 'New company', 'stores' => []];
        $insert = ['companies' => $mode === 'original' ? [$row] : ['__abcdef0123456__' => $row]];
        $created = $repo->save(FormRepository::normalize($insert, $mode), $mode);
        check($created['storage']['companies'][0]['company_seq'] === '2', "$mode: deleted sequence must not be reused");
        check($created['storage']['next']['company'] === 3, "$mode: sequence counter must increase");

        file_put_contents($file, '{invalid');
        $rejected = false;
        try { $repo->read(); } catch (JsonException) { $rejected = true; }
        check($rejected && file_get_contents($file) === '{invalid', "$mode: invalid storage must not be replaced with seed data");
        echo "$mode: repository checks passed\n";
    } finally {
        if (is_file($file)) unlink($file);
        if (is_file($file . '.lock')) unlink($file . '.lock');
    }
}
