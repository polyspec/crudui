<?php

declare(strict_types=1);

namespace CRUDUI\Generator;

/** Represent an absent value separately from explicit null. */
enum Missing
{
    case Value;
}
