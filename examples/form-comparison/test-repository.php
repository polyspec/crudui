<?php
declare(strict_types=1);
require __DIR__ . '/repository.php';

function check(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}
function formData(array $state): array
{
    return FormJson::arrays(FormJson::decode(FormJson::encode(FormRepository::loadData($state))));
}

$file = sys_get_temp_dir() . '/crudui-repository-' . bin2hex(random_bytes(6)) . '.json';
$repo = new FormRepository($file);
try {
    $before = $repo->read();
    $data = FormRepository::normalize(formData($before));
    $saved = $repo->save($data);
    check($saved['storage'] === $before, 'Save must preserve every loaded value and ID');
    $second = new FormRepository($file);
    check($second->read() === $before, 'A new repository instance must load the same file');
    $reversed = $before;
    foreach (['companies', 'stores', 'departments'] as $table) {
        $reversed[$table] = array_reverse($reversed[$table]);
    }
    check(formData($reversed) === formData($before),
        'Loading must use stored positions rather than physical record order');

    $company = array_values($data['companies'])[0];
    $data['companies']['__abcdef0123456__'] = $company;
    $rejected = false;
    try {
        $repo->save($data);
    } catch (InvalidArgumentException) {
        $rejected = true;
    }
    check($rejected, 'An existing child cannot use another parent');
    check($repo->read() === $before, 'A rejected transaction must preserve the file');

    $repo->save(['companies' => []]);
    $empty = $repo->read();
    check($empty['companies'] === [] && $empty['stores'] === []
        && $empty['departments'] === [], 'Full deletion must remove descendants');
    check($empty['next'] === $before['next'],
        'Full deletion must retain sequence counters');
    $loaded = FormRepository::loadData($empty);
    check($loaded['companies'] instanceof stdClass,
        'An empty JSON collection must remain an object');

    $row = ['name' => 'New company', 'stores' => []];
    $insert = ['companies' => ['__abcdef0123456__' => $row]];
    $created = $repo->save(FormRepository::normalize($insert));
    check($created['storage']['companies'][0]['company_seq'] === '2',
        'A deleted sequence must not be reused');
    check($created['storage']['next']['company'] === 3,
        'The sequence counter must increase');

    file_put_contents($file, '{invalid');
    $rejected = false;
    try {
        $repo->read();
    } catch (OrderedJson\ParseError) {
        $rejected = true;
    }
    check($rejected && file_get_contents($file) === '{invalid',
        'Invalid storage must not be replaced with seed data');
    echo "repository checks passed\n";
} finally {
    if (is_file($file)) unlink($file);
    if (is_file($file . '.lock')) unlink($file . '.lock');
}
