<?php
declare(strict_types=1);

namespace App;

use Illuminate\Http\Request;

/**
 * Example Laravel Controller
 *
 * Demonstrates how to use CRUDUI validation in Laravel controllers.
 */
abstract class ExampleController
{
    /**
     * Example: User registration with CRUDUI validation
     */
    public function register(Request $request): \Illuminate\Http\JsonResponse
    {
        // Method 1: Using the adapter directly
        $adapter = app('crudui.adapter');
        $result = $adapter->validate('user-registration', $request->all());

        if (!$result->isValid()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $result->getErrors(),
            ], 422);
        }

        // Process valid data...
        return response()->json([
            'success' => true,
            'message' => 'User registered successfully',
        ]);
    }

    /**
     * Example: AJAX field validation endpoint
     */
    public function validateField(Request $request): \Illuminate\Http\JsonResponse
    {
        $specName = $request->input('spec');
        $path = $request->input('path');
        $value = $request->input('value');
        $allData = $request->input('allData', []);

        $adapter = app('crudui.adapter');
        $error = $adapter->validateField($specName, $path, $value, $allData);

        return response()->json([
            'valid' => $error === null,
            'error' => $error,
        ]);
    }

    /**
     * Example: Product creation with conditional validation
     */
    public function createProduct(Request $request): \Illuminate\Http\JsonResponse
    {
        $adapter = app('crudui.adapter');

        // Get validator and add custom rule
        $validator = $adapter->getValidator('product-form');
        $validator->addRule('unique_sku', function ($value, $param, $allData, $path) {
            // Check SKU uniqueness in database
            // return !Product::where('sku', $value)->exists();
            return true; // Placeholder
        });

        $result = $validator->validate($request->all());

        if (!$result->isValid()) {
            return response()->json([
                'success' => false,
                'errors' => $result->getErrors(),
            ], 422);
        }

        // Create product...
        return response()->json([
            'success' => true,
            'message' => 'Product created',
        ], 201);
    }
}
