/**
 * Limepie Form Multiple Field Handler
 * Handles +/- buttons for multiple (array) fields
 */
$(function() {
    // Plus button - clone element
    $(document).on('click', '.btn-plus', function(e) {
        e.preventDefault();
        var $wrapper = $(this).closest('.input-group-wrapper');
        var $clone = $wrapper.clone(true);

        // Generate new uniqid
        var newId = '__' + Math.random().toString(16).substr(2, 13) + '__';
        $clone.attr('data-uniqid', newId);

        // Update name attributes with new uniqid
        $clone.find('[name]').each(function() {
            var name = $(this).attr('name');
            // Replace old uniqid pattern with new one
            name = name.replace(/__[a-f0-9]{13}__/g, newId);
            $(this).attr('name', name);
        });

        // Clear values
        $clone.find('input[type="text"], input[type="number"], textarea').val('');
        $clone.find('input[type="checkbox"], input[type="radio"]').prop('checked', false);
        $clone.find('select').prop('selectedIndex', 0);

        // Add clone-element class
        $clone.addClass('clone-element');

        // Insert after current wrapper
        $wrapper.after($clone);

        // Trigger change event
        $clone.find('input, select, textarea').first().trigger('change');
    });

    // Minus button - remove element
    $(document).on('click', '.btn-minus', function(e) {
        e.preventDefault();
        var $wrapper = $(this).closest('.input-group-wrapper');
        var $siblings = $wrapper.siblings('.input-group-wrapper');

        // Don't remove if it's the only one
        if ($siblings.length > 0) {
            $wrapper.remove();
        } else {
            // Clear values instead of removing
            $wrapper.find('input[type="text"], input[type="number"], textarea').val('');
            $wrapper.find('input[type="checkbox"], input[type="radio"]').prop('checked', false);
            $wrapper.find('select').prop('selectedIndex', 0);
        }
    });

    // Move up button
    $(document).on('click', '.btn-move-up', function(e) {
        e.preventDefault();
        var $wrapper = $(this).closest('.input-group-wrapper');
        var $prev = $wrapper.prev('.input-group-wrapper');

        if ($prev.length) {
            $wrapper.insertBefore($prev);
        }
    });

    // Move down button
    $(document).on('click', '.btn-move-down', function(e) {
        e.preventDefault();
        var $wrapper = $(this).closest('.input-group-wrapper');
        var $next = $wrapper.next('.input-group-wrapper');

        if ($next.length) {
            $wrapper.insertAfter($next);
        }
    });

    console.log('Form multiple handler loaded');
});
