<?php
/**
 * REAL Limepie Form Generator Demo
 *
 * Uses the actual Limepie library (yejune/limepie) for form generation
 */

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '1');

// Load the REAL Limepie autoloader
require_once '/var/www/vendor/autoload.php';

// Load Limepie helper functions (camelize, etc.)
require_once '/var/www/vendor/yejune/limepie/src/Limepie.php';

// Set up language for Limepie Cookie system
$_COOKIE['language'] = 'ko';
\Limepie\Cookie::setKeyStore('language', 'language');

use Limepie\Form\Generator;

// Get available specs
$specsDir = '/var/www/specs';
$specs = [];
if (is_dir($specsDir)) {
    foreach (glob($specsDir . '/*.yml') as $file) {
        $name = basename($file, '.yml');
        $specs[$name] = $file;
    }
}

// Current spec
$currentSpec = $_GET['spec'] ?? 'user-registration';
$specFile = $specs[$currentSpec] ?? null;

// Load spec
$spec = [];
if ($specFile && file_exists($specFile)) {
    $spec = yaml_parse_file($specFile);
}

// Handle form submission
$submitted = false;
$formData = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $submitted = true;
    $formData = $_POST;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>REAL Limepie Form Generator</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="/assets/css/form.css" rel="stylesheet">
    <style>
        .valid-target.is-invalid { border-color: #dc3545; }
        .valid-target.is-valid { border-color: #198754; }
        .error-message { color: #dc3545; font-size: 0.875rem; margin-top: 0.25rem; }
        pre { background: #f8f9fa; padding: 1rem; border-radius: 0.5rem; font-size: 0.75rem; }
    </style>
</head>
<body>
    <div class="container py-4">
        <div class="row mb-4">
            <div class="col-12">
                <h1 class="h3 mb-3">
                    <span class="badge bg-success">REAL</span>
                    Limepie Form Generator
                </h1>
                <p class="text-muted">
                    This uses the <strong>ACTUAL</strong> Limepie PHP library (yejune/limepie) to generate forms.
                </p>

                <ul class="nav nav-pills mb-4">
                    <?php foreach ($specs as $name => $file): ?>
                        <li class="nav-item">
                            <a class="nav-link <?= $name === $currentSpec ? 'active' : '' ?>"
                               href="?spec=<?= urlencode($name) ?>">
                                <?= ucwords(str_replace('-', ' ', $name)) ?>
                            </a>
                        </li>
                    <?php endforeach; ?>
                </ul>
            </div>
        </div>

        <div class="row">
            <div class="col-lg-7 mb-4">
                <div class="card">
                    <div class="card-header bg-success text-white">Generated Form (Real Limepie)</div>
                    <div class="card-body">
                        <?php if ($spec): ?>
                            <?php
                            try {
                                $generator = new Generator();
                                $formHtml = $generator->write($spec, $formData);
                            ?>
                            <form id="mainForm" method="POST" novalidate>
                                <?= $formHtml ?>
                            </form>
                            <?php } catch (Throwable $e) { ?>
                            <div class="alert alert-danger">
                                <strong>Error:</strong> <?= htmlspecialchars($e->getMessage()) ?>
                                <pre class="mt-2 mb-0"><?= htmlspecialchars($e->getTraceAsString()) ?></pre>
                            </div>
                            <?php } ?>

                            <?php if ($submitted): ?>
                                <div class="alert alert-success mt-3">
                                    <strong>Form Submitted!</strong>
                                    <pre class="mb-0 mt-2"><?= htmlspecialchars(json_encode($formData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) ?></pre>
                                </div>
                            <?php endif; ?>
                        <?php else: ?>
                            <div class="alert alert-warning">Spec file not found</div>
                        <?php endif; ?>
                    </div>
                </div>

                <div class="card mt-4">
                    <div class="card-header">Library Info</div>
                    <div class="card-body">
                        <p class="mb-0"><strong>Library:</strong> yejune/limepie<br>
                        <strong>Class:</strong> Limepie\Form\Generator<br>
                        <strong>Method:</strong> write($spec, $data)</p>
                    </div>
                </div>
            </div>

            <div class="col-lg-5">
                <div class="card">
                    <div class="card-header">YAML Spec</div>
                    <div class="card-body">
                        <?php if ($specFile): ?>
                            <pre style="max-height: 500px; overflow: auto;"><code><?= htmlspecialchars(file_get_contents($specFile)) ?></code></pre>
                        <?php endif; ?>
                    </div>
                </div>

                <div class="card mt-4">
                    <div class="card-header">Generated HTML</div>
                    <div class="card-body">
                        <button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="collapse" data-bs-target="#htmlSource">
                            Show HTML
                        </button>
                        <div class="collapse mt-3" id="htmlSource">
                            <?php if ($spec && isset($formHtml)): ?>
                                <pre style="max-height: 400px; overflow: auto;"><code><?= htmlspecialchars($formHtml) ?></code></pre>
                            <?php endif; ?>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
    <script src="/assets/js/dist.validate.js"></script>
    <script>
        $(function() {
            var validator = $('#mainForm').validate({ debug: true });
            console.log('Real Limepie Form Generator loaded');
        });
    </script>
</body>
</html>
