// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

function init() {
    Convenience.initTranslations();
}

const SystemInfoPrefsWidget = new GObject.Class({
    Name: 'SystemInfo.Prefs.Widget',
    GTypeName: 'SystemInfoPrefsWidget',
    Extends: Gtk.Grid,

    _init: function(params) {
        this.parent(params);
        this.margin = 12;
        this.row_spacing = this.column_spacing = 6;
        this.set_orientation(Gtk.Orientation.HORIZONTAL);

        this.add(new Gtk.Label({ label: "Refresh rate",
                                 halign: Gtk.Align.START,
                                 hexpand: true }));

        let entry = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 500,
                upper: 100000,
                step_increment: 500
            })
        });
        this.add(entry);

        this._settings = Convenience.getSettings();
        this._settings.bind('refresh-rate', entry, 'value', Gio.SettingsBindFlags.DEFAULT);
    }
});

function buildPrefsWidget() {
    let widget = new SystemInfoPrefsWidget();
    widget.show_all();

    return widget;
}
