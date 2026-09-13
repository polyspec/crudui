<?php

declare(strict_types=1);

use CRUDUI\Validator;
use CRUDUI\Validator\Compose\ComposeLoadError;
use CRUDUI\Validator\Validate\FormInputError;

$native = ($argv[1] ?? '') === 'native';
if (isset($argv[2])) require $argv[2];
if ((new ReflectionClass(Validator::class))->isInternal() !== $native) throw new RuntimeException('Incorrect validator implementation');
$root = dirname(__DIR__, 3);
$results = [];
foreach (json_decode(file_get_contents($root.'/tests/fixtures/validate/cases.json'), false, 512, JSON_THROW_ON_ERROR) as $case) {
    $options = [];
    foreach (['files','basepath'] as $option) if (property_exists($case, $option)) $options[$option] = $case->{$option};
    $failure = null;
    try {
        $actual = Validator::validate($case->spec, $case->data, $options);
    } catch (ComposeLoadError $error) {
        $failure = ['code'=>$error->getErrorCode(),'message'=>$error->getMessage(),'at'=>implode('.',$error->getCompositionTrace())];
    } catch (FormInputError $error) {
        $failure = ['code'=>$error->getErrorCode(),'message'=>$error->getMessage(),'at'=>''];
    }
    if ($failure !== null) {
        if (!property_exists($case,'expectFailure') || json_encode($failure,JSON_THROW_ON_ERROR) !== json_encode($case->expectFailure,JSON_THROW_ON_ERROR)) throw new RuntimeException($case->name.': failure differs: '.json_encode($failure));
        $results[] = ['case'=>$case->name,'failure'=>$failure];
        continue;
    }
    if (!property_exists($case, 'expected')) throw new RuntimeException($case->name.': expected a validation failure');
    if (json_encode($actual,JSON_THROW_ON_ERROR) !== json_encode($case->expected,JSON_THROW_ON_ERROR)) throw new RuntimeException('Validation result differs: '.json_encode($actual));
    $results[] = ['case'=>$case->name,'result'=>$actual];
}
foreach (['spec-validity','list-validity'] as $family) {
    foreach (json_decode(file_get_contents($root.'/tests/fixtures/'.$family.'/cases.json'), false, 512, JSON_THROW_ON_ERROR) as $case) {
        $options = [];
        foreach (['files','basepath'] as $option) if (property_exists($case,$option)) $options[$option] = $case->{$option};
        $expectation = $family === 'spec-validity' ? $case->expect : $case->engine;
        try {
            $actual = $family === 'spec-validity' ? Validator::validate($case->spec,new stdClass(),$options) : Validator::validateList($case->spec,$options);
            if ($expectation instanceof stdClass) throw new RuntimeException($case->name.': expected a composition error');
            $results[] = ['case'=>$family.':'.$case->name,'result'=>$actual];
        } catch (ComposeLoadError $error) {
            if (!$expectation instanceof stdClass) throw $error;
            $code = $family === 'spec-validity' ? $expectation->error_code : $expectation->code;
            $path = $family === 'spec-validity' ? $expectation->at_path : $expectation->at;
            if ($code !== $error->getErrorCode() || $path !== implode('.',$error->getCompositionTrace())) throw new RuntimeException($case->name.': error code or path differs');
            $results[] = ['case'=>$family.':'.$case->name,'error'=>$error->getErrorCode(),'path'=>implode('.',$error->getCompositionTrace())];
        }
    }
}
echo json_encode(['native'=>$native,'checks'=>count($results),'results'=>$results],JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES),"\n";
