$ErrorActionPreference = 'Stop'

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $rootDir) { $rootDir = 'c:\Users\dkris\OneDrive\Desktop\tcw b2b' }
$apkOutputPath = Join-Path $rootDir 'CycleWorld-B2B.apk'

Write-Host "Preparing preloaded database for Android APK..." -ForegroundColor Cyan
$dbFile = Join-Path $rootDir 'database\cycleworld_db.json'
$preloadedJsFile = Join-Path $rootDir 'js\preloaded-db.js'
if (Test-Path $dbFile) {
    $dbRaw = [System.IO.File]::ReadAllText($dbFile, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($preloadedJsFile, "window.CYCLEWORLD_PRELOADED_DB = $dbRaw;", [System.Text.Encoding]::UTF8)
}

Add-Type -ReferencedAssemblies @(
    'System.dll',
    'System.Core.dll',
    'System.Security.dll',
    'System.IO.Compression.dll',
    'System.Drawing.dll'
) -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Security.Cryptography;
using System.Security.Cryptography.Pkcs;
using System.Security.Cryptography.X509Certificates;
using System.Text;

public static class CycleWorldApkBuilder
{
    // =========================================================================
    // 1. BINARY ANDROIDMANIFEST.XML (AXML) GENERATOR
    // =========================================================================
    private class AxmlAttr
    {
        public int NsIdx;
        public int NameIdx;
        public int RawValIdx;
        public byte ValueType;
        public uint ValueData;
        public uint ResourceId;
    }

    public static byte[] BuildBinaryAndroidManifest()
    {
        // Attribute names with Android resource IDs MUST be placed first in the string pool,
        // sorted strictly by ascending resource ID:
        var attrDefs = new List<Tuple<string, uint>>
        {
            Tuple.Create("theme",               0x01010000u),
            Tuple.Create("label",               0x01010001u),
            Tuple.Create("icon",                0x01010002u),
            Tuple.Create("name",                0x01010003u),
            Tuple.Create("exported",            0x01010010u),
            Tuple.Create("configChanges",       0x0101001fu),
            Tuple.Create("minSdkVersion",       0x0101020cu),
            Tuple.Create("versionCode",         0x0101021bu),
            Tuple.Create("versionName",         0x0101021cu),
            Tuple.Create("targetSdkVersion",    0x01010270u),
            Tuple.Create("allowBackup",         0x01010280u),
            Tuple.Create("hardwareAccelerated", 0x010102d3u),
            Tuple.Create("usesCleartextTraffic",0x010104ecu)
        };

        var pool = new List<string>();
        foreach (var ad in attrDefs) pool.Add(ad.Item1);

        Func<string, int> S = (str) =>
        {
            int idx = pool.IndexOf(str);
            if (idx < 0)
            {
                idx = pool.Count;
                pool.Add(str);
            }
            return idx;
        };

        int nsPrefixIdx = S("android");
        int nsUriIdx    = S("http://schemas.android.com/apk/res/android");

        // Pre-populate remaining strings used in the manifest
        S("manifest");
        S("package");
        S("com.cycleworld.b2b");
        S("1.0.0");
        S("uses-sdk");
        S("uses-permission");
        S("android.permission.INTERNET");
        S("android.permission.ACCESS_NETWORK_STATE");
        S("android.permission.ACCESS_WIFI_STATE");
        S("application");
        S("Cycle World B2B");
        S("activity");
        S("com.cycleworld.b2b.MainActivity");
        S("intent-filter");
        S("action");
        S("android.intent.action.MAIN");
        S("category");
        S("android.intent.category.LAUNCHER");

        Func<string, uint> ResIdOf = (name) =>
        {
            foreach (var ad in attrDefs)
                if (ad.Item1 == name) return ad.Item2;
            return 0u;
        };

        Func<string, string, AxmlAttr> AttrString = (name, val) => new AxmlAttr
        {
            NsIdx = ResIdOf(name) != 0 ? nsUriIdx : -1,
            NameIdx = S(name),
            RawValIdx = S(val),
            ValueType = 0x03, // TYPE_STRING
            ValueData = (uint)S(val),
            ResourceId = ResIdOf(name)
        };

        Func<string, uint, AxmlAttr> AttrInt = (name, val) => new AxmlAttr
        {
            NsIdx = ResIdOf(name) != 0 ? nsUriIdx : -1,
            NameIdx = S(name),
            RawValIdx = -1,
            ValueType = 0x10, // TYPE_INT_DEC
            ValueData = val,
            ResourceId = ResIdOf(name)
        };

        Func<string, bool, AxmlAttr> AttrBool = (name, val) => new AxmlAttr
        {
            NsIdx = ResIdOf(name) != 0 ? nsUriIdx : -1,
            NameIdx = S(name),
            RawValIdx = -1,
            ValueType = 0x12, // TYPE_INT_BOOLEAN
            ValueData = val ? 0xFFFFFFFFu : 0u,
            ResourceId = ResIdOf(name)
        };

        Func<string, uint, AxmlAttr> AttrRef = (name, resRef) => new AxmlAttr
        {
            NsIdx = ResIdOf(name) != 0 ? nsUriIdx : -1,
            NameIdx = S(name),
            RawValIdx = -1,
            ValueType = 0x01, // TYPE_REFERENCE
            ValueData = resRef,
            ResourceId = ResIdOf(name)
        };

        MemoryStream xmlNodes = new MemoryStream();
        BinaryWriter xw = new BinaryWriter(xmlNodes);

        // Start Namespace
        xw.Write((ushort)0x0100); // RES_XML_START_NAMESPACE_TYPE
        xw.Write((ushort)16);
        xw.Write((uint)24);
        xw.Write((uint)1);
        xw.Write((uint)0xFFFFFFFFu);
        xw.Write((int)nsPrefixIdx);
        xw.Write((int)nsUriIdx);

        Action<string, List<AxmlAttr>> WriteStartElement = (elemName, attrs) =>
        {
            // Sort attributes with resourceId > 0 in ascending order of resourceId, followed by non-resource attributes
            var sorted = attrs
                .OrderBy(a => a.ResourceId == 0 ? 1 : 0)
                .ThenBy(a => a.ResourceId)
                .ThenBy(a => a.NameIdx)
                .ToList();

            uint chunkSize = (uint)(36 + sorted.Count * 20);
            xw.Write((ushort)0x0102); // RES_XML_START_ELEMENT_TYPE
            xw.Write((ushort)16);
            xw.Write(chunkSize);
            xw.Write((uint)1);
            xw.Write((uint)0xFFFFFFFFu);
            xw.Write((int)-1); // elem ns
            xw.Write((int)S(elemName));
            xw.Write((ushort)20); // attributeStart
            xw.Write((ushort)20); // attributeSize
            xw.Write((ushort)sorted.Count);
            xw.Write((ushort)0); // idIndex
            xw.Write((ushort)0); // classIndex
            xw.Write((ushort)0); // styleIndex

            foreach (var a in sorted)
            {
                xw.Write((int)a.NsIdx);
                xw.Write((int)a.NameIdx);
                xw.Write((int)a.RawValIdx);
                xw.Write((ushort)8); // size of Res_value
                xw.Write((byte)0);   // res0
                xw.Write((byte)a.ValueType);
                xw.Write((uint)a.ValueData);
            }
        };

        Action<string> WriteEndElement = (elemName) =>
        {
            xw.Write((ushort)0x0103); // RES_XML_END_ELEMENT_TYPE
            xw.Write((ushort)16);
            xw.Write((uint)24);
            xw.Write((uint)1);
            xw.Write((uint)0xFFFFFFFFu);
            xw.Write((int)-1);
            xw.Write((int)S(elemName));
        };

        // <manifest>
        WriteStartElement("manifest", new List<AxmlAttr>
        {
            AttrInt("versionCode", 1),
            AttrString("versionName", "1.0.0"),
            AttrString("package", "com.cycleworld.b2b")
        });

        // <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="28" />
        WriteStartElement("uses-sdk", new List<AxmlAttr>
        {
            AttrInt("minSdkVersion", 21),
            AttrInt("targetSdkVersion", 28)
        });
        WriteEndElement("uses-sdk");

        // <uses-permission>
        string[] perms = new string[]
        {
            "android.permission.INTERNET",
            "android.permission.ACCESS_NETWORK_STATE",
            "android.permission.ACCESS_WIFI_STATE"
        };
        foreach (string p in perms)
        {
            WriteStartElement("uses-permission", new List<AxmlAttr> { AttrString("name", p) });
            WriteEndElement("uses-permission");
        }

        // <application>
        // @android:style/Theme.Light.NoTitleBar = 0x01030006, @drawable/ic_launcher = 0x7f010000
        WriteStartElement("application", new List<AxmlAttr>
        {
            AttrRef("theme", 0x01030006u),
            AttrString("label", "Cycle World B2B"),
            AttrRef("icon", 0x7f010000u),
            AttrBool("allowBackup", true),
            AttrBool("hardwareAccelerated", true),
            AttrBool("usesCleartextTraffic", true)
        });

        // <activity>
        // configChanges: orientation(0x0080) | keyboardHidden(0x0020) | screenSize(0x0400) = 0x04A0
        WriteStartElement("activity", new List<AxmlAttr>
        {
            AttrRef("theme", 0x01030006u),
            AttrString("label", "Cycle World B2B"),
            AttrString("name", "com.cycleworld.b2b.MainActivity"),
            AttrBool("exported", true),
            AttrInt("configChanges", 0x04A0u)
        });

        // <intent-filter>
        WriteStartElement("intent-filter", new List<AxmlAttr>());
        WriteStartElement("action", new List<AxmlAttr> { AttrString("name", "android.intent.action.MAIN") });
        WriteEndElement("action");
        WriteStartElement("category", new List<AxmlAttr> { AttrString("name", "android.intent.category.LAUNCHER") });
        WriteEndElement("category");
        WriteEndElement("intent-filter");

        WriteEndElement("activity");
        WriteEndElement("application");
        WriteEndElement("manifest");

        // End Namespace
        xw.Write((ushort)0x0101); // RES_XML_END_NAMESPACE_TYPE
        xw.Write((ushort)16);
        xw.Write((uint)24);
        xw.Write((uint)1);
        xw.Write((uint)0xFFFFFFFFu);
        xw.Write((int)nsPrefixIdx);
        xw.Write((int)nsUriIdx);

        byte[] xmlNodeBytes = xmlNodes.ToArray();
        byte[] stringPoolBytes = BuildStringPoolChunk(pool);

        // Resource Map Chunk
        MemoryStream resMapMs = new MemoryStream();
        BinaryWriter rmw = new BinaryWriter(resMapMs);
        rmw.Write((ushort)0x0180); // RES_XML_RESOURCE_MAP_TYPE
        rmw.Write((ushort)8);
        rmw.Write((uint)(8 + attrDefs.Count * 4));
        foreach (var ad in attrDefs) rmw.Write(ad.Item2);
        byte[] resMapBytes = resMapMs.ToArray();

        MemoryStream finalMs = new MemoryStream();
        BinaryWriter fw = new BinaryWriter(finalMs);
        uint totalSize = (uint)(8 + stringPoolBytes.Length + resMapBytes.Length + xmlNodeBytes.Length);
        fw.Write((ushort)0x0003); // RES_XML_TYPE
        fw.Write((ushort)8);
        fw.Write(totalSize);
        fw.Write(stringPoolBytes);
        fw.Write(resMapBytes);
        fw.Write(xmlNodeBytes);
        return finalMs.ToArray();
    }

    private static byte[] BuildStringPoolChunk(List<string> strings)
    {
        MemoryStream strDataMs = new MemoryStream();
        BinaryWriter sdw = new BinaryWriter(strDataMs);
        List<uint> offsets = new List<uint>();

        foreach (string s in strings)
        {
            offsets.Add((uint)strDataMs.Position);
            sdw.Write((ushort)s.Length);
            byte[] u16 = Encoding.Unicode.GetBytes(s);
            sdw.Write(u16);
            sdw.Write((ushort)0); // null terminator
        }
        while (strDataMs.Position % 4 != 0) sdw.Write((byte)0);
        byte[] strData = strDataMs.ToArray();

        uint headerSize = 28;
        uint stringsStart = headerSize + (uint)(strings.Count * 4);
        uint chunkSize = stringsStart + (uint)strData.Length;

        MemoryStream ms = new MemoryStream();
        BinaryWriter bw = new BinaryWriter(ms);
        bw.Write((ushort)0x0001); // RES_STRING_POOL_TYPE
        bw.Write((ushort)headerSize);
        bw.Write(chunkSize);
        bw.Write((uint)strings.Count);
        bw.Write((uint)0); // styleCount
        bw.Write((uint)0); // flags (0 = UTF-16)
        bw.Write(stringsStart);
        bw.Write((uint)0); // stylesStart
        foreach (uint off in offsets) bw.Write(off);
        bw.Write(strData);
        return ms.ToArray();
    }

    // =========================================================================
    // 2. BINARY RESOURCES.ARSC GENERATOR (@drawable/ic_launcher = 0x7f010000)
    // =========================================================================
    public static byte[] BuildResourcesArsc()
    {
        // Global value string pool: ["res/drawable/ic_launcher.png"]
        byte[] globalPool = BuildStringPoolChunk(new List<string> { "res/drawable/ic_launcher.png" });
        // Type string pool: ["drawable"]
        byte[] typePool = BuildStringPoolChunk(new List<string> { "drawable" });
        // Key string pool: ["ic_launcher"]
        byte[] keyPool = BuildStringPoolChunk(new List<string> { "ic_launcher" });

        // ResTable_typeSpec for type 1 (drawable), 1 entry
        MemoryStream typeSpecMs = new MemoryStream();
        BinaryWriter tsw = new BinaryWriter(typeSpecMs);
        tsw.Write((ushort)0x0202); // RES_TABLE_TYPE_SPEC_TYPE
        tsw.Write((ushort)16);
        tsw.Write((uint)20);
        tsw.Write((byte)1); // id = 1
        tsw.Write((byte)0);
        tsw.Write((ushort)0);
        tsw.Write((uint)1); // entryCount = 1
        tsw.Write((uint)0); // config mask = 0
        byte[] typeSpecBytes = typeSpecMs.ToArray();

        // ResTable_type for type 1 (drawable), default config, 1 entry
        MemoryStream typeMs = new MemoryStream();
        BinaryWriter tw = new BinaryWriter(typeMs);
        uint typeHeaderSize = 52; // 20 + 32-byte ResTable_config
        uint entriesStart = typeHeaderSize + 4; // 1 uint32 offset
        uint entrySize = 16; // 8-byte ResTable_entry + 8-byte Res_value
        uint typeChunkSize = entriesStart + entrySize;

        tw.Write((ushort)0x0201); // RES_TABLE_TYPE_TYPE
        tw.Write((ushort)typeHeaderSize);
        tw.Write(typeChunkSize);
        tw.Write((byte)1); // id = 1
        tw.Write((byte)0);
        tw.Write((ushort)0);
        tw.Write((uint)1); // entryCount = 1
        tw.Write(entriesStart);
        // ResTable_config (32 bytes)
        tw.Write((uint)32); // size
        for (int i = 0; i < 7; i++) tw.Write((uint)0);
        // Offset table
        tw.Write((uint)0); // entry 0 at offset 0
        // ResTable_entry (8 bytes)
        tw.Write((ushort)8); // size
        tw.Write((ushort)0); // flags
        tw.Write((uint)0);   // key index = 0 ("ic_launcher")
        // Res_value (8 bytes) -> string index 0 ("res/drawable/ic_launcher.png")
        tw.Write((ushort)8);
        tw.Write((byte)0);
        tw.Write((byte)0x03); // TYPE_STRING
        tw.Write((uint)0);
        byte[] typeBytes = typeMs.ToArray();

        // ResTable_package
        MemoryStream pkgMs = new MemoryStream();
        BinaryWriter pw = new BinaryWriter(pkgMs);
        uint pkgHeaderSize = 288;
        uint typeStringsOffset = pkgHeaderSize;
        uint keyStringsOffset = typeStringsOffset + (uint)typePool.Length;
        uint pkgChunkSize = keyStringsOffset + (uint)keyPool.Length + (uint)typeSpecBytes.Length + (uint)typeBytes.Length;

        pw.Write((ushort)0x0200); // RES_TABLE_PACKAGE_TYPE
        pw.Write((ushort)pkgHeaderSize);
        pw.Write(pkgChunkSize);
        pw.Write((uint)0x7f); // package id = 0x7f
        // 128 char16_t (256 bytes) package name
        byte[] nameBytes = new byte[256];
        byte[] rawName = Encoding.Unicode.GetBytes("com.cycleworld.b2b");
        Array.Copy(rawName, nameBytes, rawName.Length);
        pw.Write(nameBytes);
        pw.Write(typeStringsOffset);
        pw.Write((uint)1); // lastPublicType
        pw.Write(keyStringsOffset);
        pw.Write((uint)1); // lastPublicKey
        pw.Write((uint)0); // typeIdOffset
        pw.Write(typePool);
        pw.Write(keyPool);
        pw.Write(typeSpecBytes);
        pw.Write(typeBytes);
        byte[] pkgBytes = pkgMs.ToArray();

        // Top-level ResTable_header
        MemoryStream arscMs = new MemoryStream();
        BinaryWriter aw = new BinaryWriter(arscMs);
        uint totalArscSize = 12 + (uint)globalPool.Length + (uint)pkgBytes.Length;
        aw.Write((ushort)0x0002); // RES_TABLE_TYPE
        aw.Write((ushort)12);
        aw.Write(totalArscSize);
        aw.Write((uint)1); // packageCount = 1
        aw.Write(globalPool);
        aw.Write(pkgBytes);
        return arscMs.ToArray();
    }

    // =========================================================================
    // 3. LAUNCHER ICON GENERATOR (res/drawable/ic_launcher.png)
    // =========================================================================
    public static byte[] BuildLauncherIconPng()
    {
        using (Bitmap bmp = new Bitmap(144, 144, PixelFormat.Format32bppArgb))
        using (Graphics g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.FromArgb(255, 15, 41, 30)); // Cycle World Deep Green
            using (SolidBrush circleBrush = new SolidBrush(Color.FromArgb(255, 22, 163, 74)))
            {
                g.FillEllipse(circleBrush, 10, 10, 124, 124);
            }
            using (Pen wheelPen = new Pen(Color.White, 6f))
            {
                g.DrawEllipse(wheelPen, 24, 68, 36, 36);
                g.DrawEllipse(wheelPen, 84, 68, 36, 36);
                g.DrawLine(wheelPen, 42, 86, 65, 56);
                g.DrawLine(wheelPen, 65, 56, 96, 56);
                g.DrawLine(wheelPen, 96, 56, 102, 86);
                g.DrawLine(wheelPen, 42, 86, 74, 86);
                g.DrawLine(wheelPen, 74, 86, 96, 56);
            }
            using (Font f = new Font("Arial", 16, FontStyle.Bold, GraphicsUnit.Pixel))
            using (SolidBrush textBrush = new SolidBrush(Color.White))
            {
                StringFormat sf = new StringFormat { Alignment = StringAlignment.Center };
                g.DrawString("TCW B2B", f, textBrush, new RectangleF(0, 24, 144, 28), sf);
            }
            using (MemoryStream ms = new MemoryStream())
            {
                bmp.Save(ms, ImageFormat.Png);
                return ms.ToArray();
            }
        }
    }

    // =========================================================================
    // 4. DALVIK EXECUTABLE (classes.dex) COMPILER FOR MainActivity
    // =========================================================================
    private class DexProto
    {
        public string Shorty;
        public string ReturnType;
        public string[] ParamTypes;
    }

    private class DexField
    {
        public string ClassType;
        public string Type;
        public string Name;
    }

    private class DexMethod
    {
        public string ClassType;
        public DexProto Proto;
        public string Name;
    }

    private static void WriteUleb128(BinaryWriter bw, uint val)
    {
        do
        {
            byte b = (byte)(val & 0x7f);
            val >>= 7;
            if (val != 0) b |= 0x80;
            bw.Write(b);
        } while (val != 0);
    }

    public static byte[] BuildClassesDex()
    {
        var stringSet = new HashSet<string>
        {
            "<init>",
            "I",
            " Landroid/app/Activity;",
            "Landroid/app/Activity;",
            "Landroid/content/Context;",
            "Landroid/os/Bundle;",
            "Landroid/view/View;",
            "Landroid/webkit/WebChromeClient;",
            "Landroid/webkit/WebSettings;",
            "Landroid/webkit/WebView;",
            "Landroid/webkit/WebViewClient;",
            "Lcom/cycleworld/b2b/MainActivity;",
            "Ljava/lang/String;",
            "L",
            "V",
            "VI",
            "VL",
            "VZ",
            "Z",
            "ZI",
            "canGoBack",
            "file:///android_asset/www/index.html",
            "getSettings",
            "goBack",
            "loadUrl",
            "onBackPressed",
            "onCreate",
            "requestWindowFeature",
            "setAllowContentAccess",
            "setAllowFileAccess",
            "setAllowFileAccessFromFileURLs",
            "setAllowUniversalAccessFromFileURLs",
            "setContentView",
            "setDatabaseEnabled",
            "setDomStorageEnabled",
            "setJavaScriptEnabled",
            "setLoadWithOverviewMode",
            "setMixedContentMode",
            "setUseWideViewPort",
            "setWebChromeClient",
            "setWebViewClient",
            "webView"
        };
        stringSet.Remove(" Landroid/app/Activity;");

        var strings = stringSet.ToList();
        strings.Sort(StringComparer.Ordinal);
        Func<string, int> StrIdx = s => strings.IndexOf(s);

        var typeDescriptors = new List<string>
        {
            "I",
            "Landroid/app/Activity;",
            "Landroid/content/Context;",
            "Landroid/os/Bundle;",
            "Landroid/view/View;",
            "Landroid/webkit/WebChromeClient;",
            "Landroid/webkit/WebSettings;",
            "Landroid/webkit/WebView;",
            "Landroid/webkit/WebViewClient;",
            "Lcom/cycleworld/b2b/MainActivity;",
            "Ljava/lang/String;",
            "V",
            "Z"
        };
        typeDescriptors.Sort((a, b) => StrIdx(a).CompareTo(StrIdx(b)));
        Func<string, int> TypeIdx = t => typeDescriptors.IndexOf(t);

        var protos = new List<DexProto>
        {
            new DexProto { Shorty = "L",  ReturnType = "Landroid/webkit/WebSettings;", ParamTypes = new string[0] },
            new DexProto { Shorty = "V",  ReturnType = "V", ParamTypes = new string[0] },
            new DexProto { Shorty = "VI", ReturnType = "V", ParamTypes = new[] { "I" } },
            new DexProto { Shorty = "VL", ReturnType = "V", ParamTypes = new[] { "Landroid/content/Context;" } },
            new DexProto { Shorty = "VL", ReturnType = "V", ParamTypes = new[] { "Landroid/os/Bundle;" } },
            new DexProto { Shorty = "VL", ReturnType = "V", ParamTypes = new[] { "Landroid/view/View;" } },
            new DexProto { Shorty = "VL", ReturnType = "V", ParamTypes = new[] { "Landroid/webkit/WebChromeClient;" } },
            new DexProto { Shorty = "VL", ReturnType = "V", ParamTypes = new[] { "Landroid/webkit/WebViewClient;" } },
            new DexProto { Shorty = "VL", ReturnType = "V", ParamTypes = new[] { "Ljava/lang/String;" } },
            new DexProto { Shorty = "VZ", ReturnType = "V", ParamTypes = new[] { "Z" } },
            new DexProto { Shorty = "Z",  ReturnType = "Z", ParamTypes = new string[0] },
            new DexProto { Shorty = "ZI", ReturnType = "Z", ParamTypes = new[] { "I" } }
        };

        protos.Sort((a, b) =>
        {
            int c = TypeIdx(a.ReturnType).CompareTo(TypeIdx(b.ReturnType));
            if (c != 0) return c;
            int minLen = Math.Min(a.ParamTypes.Length, b.ParamTypes.Length);
            for (int i = 0; i < minLen; i++)
            {
                c = TypeIdx(a.ParamTypes[i]).CompareTo(TypeIdx(b.ParamTypes[i]));
                if (c != 0) return c;
            }
            return a.ParamTypes.Length.CompareTo(b.ParamTypes.Length);
        });

        Func<string, string[], int> ProtoIdx = (ret, prms) =>
        {
            for (int i = 0; i < protos.Count; i++)
            {
                if (protos[i].ReturnType == ret && protos[i].ParamTypes.SequenceEqual(prms))
                    return i;
            }
            throw new Exception("Proto not found: " + ret);
        };

        var fields = new List<DexField>
        {
            new DexField { ClassType = "Lcom/cycleworld/b2b/MainActivity;", Type = "Landroid/webkit/WebView;", Name = "webView" }
        };

        var methods = new List<DexMethod>
        {
            new DexMethod { ClassType = "Landroid/app/Activity;", Name = "<init>", Proto = protos[ProtoIdx("V", new string[0])] },
            new DexMethod { ClassType = "Landroid/app/Activity;", Name = "onBackPressed", Proto = protos[ProtoIdx("V", new string[0])] },
            new DexMethod { ClassType = "Landroid/app/Activity;", Name = "onCreate", Proto = protos[ProtoIdx("V", new[] { "Landroid/os/Bundle;" })] },
            new DexMethod { ClassType = "Landroid/app/Activity;", Name = "requestWindowFeature", Proto = protos[ProtoIdx("Z", new[] { "I" })] },
            new DexMethod { ClassType = "Landroid/app/Activity;", Name = "setContentView", Proto = protos[ProtoIdx("V", new[] { "Landroid/view/View;" })] },
            new DexMethod { ClassType = "Landroid/webkit/WebChromeClient;", Name = "<init>", Proto = protos[ProtoIdx("V", new string[0])] },
            new DexMethod { ClassType = "Landroid/webkit/WebSettings;", Name = "setAllowContentAccess", Proto = protos[ProtoIdx("V", new[] { "Z" })] },
            new DexMethod { ClassType = "Landroid/webkit/WebSettings;", Name = "setAllowFileAccess", Proto = protos[ProtoIdx("V", new[] { "Z" })] },
            new DexMethod { ClassType = "Landroid/webkit/WebSettings;", Name = "setAllowFileAccessFromFileURLs", Proto = protos[ProtoIdx("V", new[] { "Z" })] },
            new DexMethod { ClassType = "Landroid/webkit/WebSettings;", Name = "setAllowUniversalAccessFromFileURLs", Proto = protos[ProtoIdx("V", new[] { "Z" })] },
            new DexMethod { ClassType = "Landroid/webkit/WebSettings;", Name = "setDatabaseEnabled", Proto = protos[ProtoIdx("V", new[] { "Z" })] },
            new DexMethod { ClassType = "Landroid/webkit/WebSettings;", Name = "setDomStorageEnabled", Proto = protos[ProtoIdx("V", new[] { "Z" })] },
            new DexMethod { ClassType = "Landroid/webkit/WebSettings;", Name = "setJavaScriptEnabled", Proto = protos[ProtoIdx("V", new[] { "Z" })] },
            new DexMethod { ClassType = "Landroid/webkit/WebSettings;", Name = "setLoadWithOverviewMode", Proto = protos[ProtoIdx("V", new[] { "Z" })] },
            new DexMethod { ClassType = "Landroid/webkit/WebSettings;", Name = "setMixedContentMode", Proto = protos[ProtoIdx("V", new[] { "I" })] },
            new DexMethod { ClassType = "Landroid/webkit/WebSettings;", Name = "setUseWideViewPort", Proto = protos[ProtoIdx("V", new[] { "Z" })] },
            new DexMethod { ClassType = "Landroid/webkit/WebView;", Name = "<init>", Proto = protos[ProtoIdx("V", new[] { "Landroid/content/Context;" })] },
            new DexMethod { ClassType = "Landroid/webkit/WebView;", Name = "canGoBack", Proto = protos[ProtoIdx("Z", new string[0])] },
            new DexMethod { ClassType = "Landroid/webkit/WebView;", Name = "getSettings", Proto = protos[ProtoIdx("Landroid/webkit/WebSettings;", new string[0])] },
            new DexMethod { ClassType = "Landroid/webkit/WebView;", Name = "goBack", Proto = protos[ProtoIdx("V", new string[0])] },
            new DexMethod { ClassType = "Landroid/webkit/WebView;", Name = "loadUrl", Proto = protos[ProtoIdx("V", new[] { "Ljava/lang/String;" })] },
            new DexMethod { ClassType = "Landroid/webkit/WebView;", Name = "setWebChromeClient", Proto = protos[ProtoIdx("V", new[] { "Landroid/webkit/WebChromeClient;" })] },
            new DexMethod { ClassType = "Landroid/webkit/WebView;", Name = "setWebViewClient", Proto = protos[ProtoIdx("V", new[] { "Landroid/webkit/WebViewClient;" })] },
            new DexMethod { ClassType = "Landroid/webkit/WebViewClient;", Name = "<init>", Proto = protos[ProtoIdx("V", new string[0])] },
            new DexMethod { ClassType = "Lcom/cycleworld/b2b/MainActivity;", Name = "<init>", Proto = protos[ProtoIdx("V", new string[0])] },
            new DexMethod { ClassType = "Lcom/cycleworld/b2b/MainActivity;", Name = "onBackPressed", Proto = protos[ProtoIdx("V", new string[0])] },
            new DexMethod { ClassType = "Lcom/cycleworld/b2b/MainActivity;", Name = "onCreate", Proto = protos[ProtoIdx("V", new[] { "Landroid/os/Bundle;" })] }
        };

        methods.Sort((a, b) =>
        {
            int c = TypeIdx(a.ClassType).CompareTo(TypeIdx(b.ClassType));
            if (c != 0) return c;
            c = StrIdx(a.Name).CompareTo(StrIdx(b.Name));
            if (c != 0) return c;
            return protos.IndexOf(a.Proto).CompareTo(protos.IndexOf(b.Proto));
        });

        Func<string, string, ushort> MIdx = (cls, name) =>
        {
            for (int i = 0; i < methods.Count; i++)
                if (methods[i].ClassType == cls && methods[i].Name == name)
                    return (ushort)i;
            throw new Exception("Method not found: " + cls + "->" + name);
        };

        // Build code_item for <init>()V
        byte[] codeInit;
        using (var ms = new MemoryStream())
        using (var bw = new BinaryWriter(ms))
        {
            bw.Write((ushort)1); // registers_size
            bw.Write((ushort)1); // ins_size
            bw.Write((ushort)1); // outs_size
            bw.Write((ushort)0); // tries_size
            bw.Write((uint)0);   // debug_info_off
            bw.Write((uint)4);   // insns_size (4 16-bit code units)
            // invoke-direct {v0}, Landroid/app/Activity;-><init>()V
            bw.Write((ushort)0x1070);
            bw.Write(MIdx("Landroid/app/Activity;", "<init>"));
            bw.Write((ushort)0x0000);
            // return-void
            bw.Write((ushort)0x000e);
            codeInit = ms.ToArray();
        }

        // Build code_item for onBackPressed()V
        byte[] codeBack;
        using (var ms = new MemoryStream())
        using (var bw = new BinaryWriter(ms))
        {
            bw.Write((ushort)2); // registers_size (v0 = local, v1 = this)
            bw.Write((ushort)1); // ins_size
            bw.Write((ushort)1); // outs_size
            bw.Write((ushort)0); // tries_size
            bw.Write((uint)0);   // debug_info_off
            bw.Write((uint)18);  // insns_size (18 code units)
            // 00: iget-object v0, v1, field@0 (2 units)
            bw.Write((ushort)0x1054);
            bw.Write((ushort)0);
            // 02: if-eqz v0, +12 (-> 14) (2 units)
            bw.Write((ushort)0x0038);
            bw.Write((ushort)12);
            // 04: invoke-virtual {v0}, WebView.canGoBack (3 units)
            bw.Write((ushort)0x106e);
            bw.Write(MIdx("Landroid/webkit/WebView;", "canGoBack"));
            bw.Write((ushort)0x0000);
            // 07: move-result v0 (1 unit)
            bw.Write((ushort)0x000a);
            // 08: if-eqz v0, +6 (-> 14) (2 units)
            bw.Write((ushort)0x0038);
            bw.Write((ushort)6);
            // 10: iget-object v0, v1, field@0 (2 units)
            bw.Write((ushort)0x1054);
            bw.Write((ushort)0);
            // 12: invoke-virtual {v0}, WebView.goBack (3 units) ->Wait: 10+2=12, 12+3=15, +1 return-void = 16!
            // Let's check offsets carefully!
            codeBack = null;
        }

        // Let's re-verify exact unit offsets for onBackPressed()V:
        // 00 (len 2): iget-object v0, v1, field@0
        // 02 (len 2): if-eqz v0, +14 (-> target 16)
        // 04 (len 3): invoke-virtual {v0}, WebView.canGoBack()Z
        // 07 (len 1): move-result v0
        // 08 (len 2): if-eqz v0, +8 (-> target 16)
        // 10 (len 2): iget-object v0, v1, field@0
        // 12 (len 3): invoke-virtual {v0}, WebView.goBack()V
        // 15 (len 1): return-void
        // 16 (len 3): invoke-super {v1}, Activity.onBackPressed()V
        // 19 (len 1): return-void
        // Total units = 20!
        using (var ms = new MemoryStream())
        using (var bw = new BinaryWriter(ms))
        {
            bw.Write((ushort)2); // registers_size
            bw.Write((ushort)1); // ins_size
            bw.Write((ushort)1); // outs_size
            bw.Write((ushort)0); // tries_size
            bw.Write((uint)0);   // debug_info_off
            bw.Write((uint)20);  // insns_size (20 code units)
            bw.Write((ushort)0x1054); bw.Write((ushort)0); // 00..01
            bw.Write((ushort)0x0038); bw.Write((ushort)14); // 02..03 -> 16
            bw.Write((ushort)0x106e); bw.Write(MIdx("Landroid/webkit/WebView;", "canGoBack")); bw.Write((ushort)0x0000); // 04..06
            bw.Write((ushort)0x000a); // 07
            bw.Write((ushort)0x0038); bw.Write((ushort)8); // 08..09 -> 16
            bw.Write((ushort)0x1054); bw.Write((ushort)0); // 10..11
            bw.Write((ushort)0x106e); bw.Write(MIdx("Landroid/webkit/WebView;", "goBack")); bw.Write((ushort)0x0000); // 12..14
            bw.Write((ushort)0x000e); // 15
            bw.Write((ushort)0x106f); bw.Write(MIdx("Landroid/app/Activity;", "onBackPressed")); bw.Write((ushort)0x0001); // 16..18
            bw.Write((ushort)0x000e); // 19
            codeBack = ms.ToArray();
        }

        // Build code_item for onCreate(Landroid/os/Bundle;)V
        // Registers: v0, v1, v2 (locals), v3 (this), v4 (bundle) -> registers_size = 5, ins_size = 2, outs_size = 2
        byte[] codeOnCreate;
        using (var ms = new MemoryStream())
        using (var bw = new BinaryWriter(ms))
        {
            MemoryStream insnsMs = new MemoryStream();
            BinaryWriter iw = new BinaryWriter(insnsMs);

            Action<ushort, byte, byte> InvokeSuper2 = (mIdx, rA, rB) =>
            {
                iw.Write((ushort)0x206f);
                iw.Write(mIdx);
                iw.Write((ushort)(rA | (rB << 4)));
            };
            Action<ushort, byte> InvokeDirect1 = (mIdx, rA) =>
            {
                iw.Write((ushort)0x1070);
                iw.Write(mIdx);
                iw.Write((ushort)rA);
            };
            Action<ushort, byte, byte> InvokeDirect2 = (mIdx, rA, rB) =>
            {
                iw.Write((ushort)0x2070);
                iw.Write(mIdx);
                iw.Write((ushort)(rA | (rB << 4)));
            };
            Action<ushort, byte> InvokeVirtual1 = (mIdx, rA) =>
            {
                iw.Write((ushort)0x106e);
                iw.Write(mIdx);
                iw.Write((ushort)rA);
            };
            Action<ushort, byte, byte> InvokeVirtual2 = (mIdx, rA, rB) =>
            {
                iw.Write((ushort)0x206e);
                iw.Write(mIdx);
                iw.Write((ushort)(rA | (rB << 4)));
            };

            // 1. super.onCreate(bundle)
            InvokeSuper2(MIdx("Landroid/app/Activity;", "onCreate"), 3, 4);
            // 2. const/4 v2, 1
            iw.Write((ushort)0x1212);
            // 3. this.requestWindowFeature(1)
            InvokeVirtual2(MIdx("Landroid/app/Activity;", "requestWindowFeature"), 3, 2);
            // 4. new-instance v0, Landroid/webkit/WebView;
            iw.Write((ushort)0x0022);
            iw.Write((ushort)TypeIdx("Landroid/webkit/WebView;"));
            // 5. invoke-direct {v0, v3}, WebView.<init>(Context)
            InvokeDirect2(MIdx("Landroid/webkit/WebView;", "<init>"), 0, 3);
            // 6. iput-object v0, v3, MainActivity.webView
            iw.Write((ushort)0x305b);
            iw.Write((ushort)0);
            // 7. invoke-virtual {v0}, WebView.getSettings()
            InvokeVirtual1(MIdx("Landroid/webkit/WebView;", "getSettings"), 0);
            // 8. move-result-object v1
            iw.Write((ushort)0x010c);
            // 9..17. WebSettings boolean flags (v2 == 1)
            string[] trueSettings = new[]
            {
                "setJavaScriptEnabled",
                "setDomStorageEnabled",
                "setDatabaseEnabled",
                "setAllowFileAccess",
                "setAllowContentAccess",
                "setAllowFileAccessFromFileURLs",
                "setAllowUniversalAccessFromFileURLs",
                "setUseWideViewPort",
                "setLoadWithOverviewMode"
            };
            foreach (string sName in trueSettings)
            {
                InvokeVirtual2(MIdx("Landroid/webkit/WebSettings;", sName), 1, 2);
            }
            // 18. const/4 v2, 0
            iw.Write((ushort)0x0212);
            // 19. settings.setMixedContentMode(0)
            InvokeVirtual2(MIdx("Landroid/webkit/WebSettings;", "setMixedContentMode"), 1, 2);
            // 20. new-instance v2, WebViewClient
            iw.Write((ushort)0x0222);
            iw.Write((ushort)TypeIdx("Landroid/webkit/WebViewClient;"));
            InvokeDirect1(MIdx("Landroid/webkit/WebViewClient;", "<init>"), 2);
            InvokeVirtual2(MIdx("Landroid/webkit/WebView;", "setWebViewClient"), 0, 2);
            // 21. new-instance v2, WebChromeClient
            iw.Write((ushort)0x0222);
            iw.Write((ushort)TypeIdx("Landroid/webkit/WebChromeClient;"));
            InvokeDirect1(MIdx("Landroid/webkit/WebChromeClient;", "<init>"), 2);
            InvokeVirtual2(MIdx("Landroid/webkit/WebView;", "setWebChromeClient"), 0, 2);
            // 22. this.setContentView(v0)
            InvokeVirtual2(MIdx("Landroid/app/Activity;", "setContentView"), 3, 0);
            // 23. const-string v2, "file:///android_asset/www/index.html"
            iw.Write((ushort)0x021a);
            iw.Write((ushort)StrIdx("file:///android_asset/www/index.html"));
            // 24. webView.loadUrl(v2)
            InvokeVirtual2(MIdx("Landroid/webkit/WebView;", "loadUrl"), 0, 2);
            // 25. return-void
            iw.Write((ushort)0x000e);

            byte[] insnsBytes = insnsMs.ToArray();
            bw.Write((ushort)5); // registers_size
            bw.Write((ushort)2); // ins_size
            bw.Write((ushort)2); // outs_size
            bw.Write((ushort)0); // tries_size
            bw.Write((uint)0);   // debug_info_off
            bw.Write((uint)(insnsBytes.Length / 2));
            bw.Write(insnsBytes);
            if ((insnsBytes.Length / 2) % 2 != 0) bw.Write((ushort)0); // 4-byte align
            codeOnCreate = ms.ToArray();
        }

        // Now assemble the entire DEX file with exact offsets and map_list
        // Fixed index tables:
        // Header: 0x70 (112 bytes)
        // string_ids: strings.Count * 4
        // type_ids: typeDescriptors.Count * 4
        // proto_ids: protos.Count * 12
        // field_ids: fields.Count * 8
        // method_ids: methods.Count * 8
        // class_defs: 1 * 32
        uint headerOff = 0;
        uint stringIdsOff = 0x70;
        uint typeIdsOff = stringIdsOff + (uint)(strings.Count * 4);
        uint protoIdsOff = typeIdsOff + (uint)(typeDescriptors.Count * 4);
        uint fieldIdsOff = protoIdsOff + (uint)(protos.Count * 12);
        uint methodIdsOff = fieldIdsOff + (uint)(fields.Count * 8);
        uint classDefsOff = methodIdsOff + (uint)(methods.Count * 8);
        uint dataOff = classDefsOff + 32;

        // Data section items:
        // 1. type_list items for protos with ParamTypes.Length > 0 (4-byte aligned)
        MemoryStream dataMs = new MemoryStream();
        BinaryWriter dw = new BinaryWriter(dataMs);
        Action Align4 = () => { while (dataMs.Position % 4 != 0) dw.Write((byte)0); };

        uint typeListOff = dataOff + (uint)dataMs.Position;
        var protoTypeListOffsets = new Dictionary<int, uint>();
        var seenParamLists = new Dictionary<string, uint>();
        for (int i = 0; i < protos.Count; i++)
        {
            if (protos[i].ParamTypes.Length == 0)
            {
                protoTypeListOffsets[i] = 0;
            }
            else
            {
                string key = string.Join(",", protos[i].ParamTypes);
                if (!seenParamLists.ContainsKey(key))
                {
                    Align4();
                    uint off = dataOff + (uint)dataMs.Position;
                    seenParamLists[key] = off;
                    dw.Write((uint)protos[i].ParamTypes.Length);
                    foreach (string pt in protos[i].ParamTypes)
                        dw.Write((ushort)TypeIdx(pt));
                }
                protoTypeListOffsets[i] = seenParamLists[key];
            }
        }

        // 2. code_item section (4-byte aligned)
        Align4();
        uint codeInitOff = dataOff + (uint)dataMs.Position;
        dw.Write(codeInit);
        Align4();
        uint codeBackOff = dataOff + (uint)dataMs.Position;
        dw.Write(codeBack);
        Align4();
        uint codeOnCreateOff = dataOff + (uint)dataMs.Position;
        dw.Write(codeOnCreate);

        // 3. string_data_item section
        uint firstStringDataOff = dataOff + (uint)dataMs.Position;
        var stringDataOffsets = new List<uint>();
        foreach (string s in strings)
        {
            stringDataOffsets.Add(dataOff + (uint)dataMs.Position);
            WriteUleb128(dw, (uint)s.Length);
            byte[] utf8 = Encoding.UTF8.GetBytes(s);
            dw.Write(utf8);
            dw.Write((byte)0);
        }

        // 4. class_data_item section
        uint classDataOff = dataOff + (uint)dataMs.Position;
        WriteUleb128(dw, 0); // static_fields_size
        WriteUleb128(dw, 1); // instance_fields_size
        WriteUleb128(dw, 1); // direct_methods_size
        WriteUleb128(dw, 2); // virtual_methods_size

        // instance field 0: webView (idx 0, ACC_PRIVATE = 2)
        WriteUleb128(dw, 0);
        WriteUleb128(dw, 0x0002);

        // direct method 0: MainActivity.<init> (ACC_PUBLIC | ACC_CONSTRUCTOR = 0x10001)
        ushort mMainInit = MIdx("Lcom/cycleworld/b2b/MainActivity;", "<init>");
        WriteUleb128(dw, mMainInit);
        WriteUleb128(dw, 0x10001);
        WriteUleb128(dw, codeInitOff);

        // virtual method 0: MainActivity.onBackPressed (ACC_PUBLIC = 0x0001)
        ushort mMainBack = MIdx("Lcom/cycleworld/b2b/MainActivity;", "onBackPressed");
        ushort mMainCreate = MIdx("Lcom/cycleworld/b2b/MainActivity;", "onCreate");
        WriteUleb128(dw, mMainBack);
        WriteUleb128(dw, 0x0001);
        WriteUleb128(dw, codeBackOff);

        // virtual method 1: MainActivity.onCreate (diff from mMainBack, ACC_PROTECTED = 0x0004)
        WriteUleb128(dw, (uint)(mMainCreate - mMainBack));
        WriteUleb128(dw, 0x0004);
        WriteUleb128(dw, codeOnCreateOff);

        // 5. map_list (4-byte aligned)
        Align4();
        uint mapListOff = dataOff + (uint)dataMs.Position;
        var mapItems = new List<Tuple<ushort, uint, uint>>
        {
            Tuple.Create((ushort)0x0000, 1u, headerOff),
            Tuple.Create((ushort)0x0001, (uint)strings.Count, stringIdsOff),
            Tuple.Create((ushort)0x0002, (uint)typeDescriptors.Count, typeIdsOff),
            Tuple.Create((ushort)0x0003, (uint)protos.Count, protoIdsOff),
            Tuple.Create((ushort)0x0004, (uint)fields.Count, fieldIdsOff),
            Tuple.Create((ushort)0x0005, (uint)methods.Count, methodIdsOff),
            Tuple.Create((ushort)0x0006, 1u, classDefsOff),
            Tuple.Create((ushort)0x1001, (uint)seenParamLists.Count, typeListOff),
            Tuple.Create((ushort)0x2001, 3u, codeInitOff),
            Tuple.Create((ushort)0x2002, (uint)strings.Count, firstStringDataOff),
            Tuple.Create((ushort)0x2000, 1u, classDataOff),
            Tuple.Create((ushort)0x1000, 1u, mapListOff)
        };
        dw.Write((uint)mapItems.Count);
        foreach (var mi in mapItems)
        {
            dw.Write(mi.Item1);
            dw.Write((ushort)0);
            dw.Write(mi.Item2);
            dw.Write(mi.Item3);
        }

        byte[] dataBytes = dataMs.ToArray();
        uint fileSize = dataOff + (uint)dataBytes.Length;

        MemoryStream dexMs = new MemoryStream();
        BinaryWriter dexW = new BinaryWriter(dexMs);

        // Header (112 bytes)
        dexW.Write(new byte[] { 0x64, 0x65, 0x78, 0x0a, 0x30, 0x33, 0x35, 0x00 }); // "dex\n035\0"
        dexW.Write((uint)0); // checksum placeholder
        dexW.Write(new byte[20]); // SHA-1 placeholder
        dexW.Write(fileSize);
        dexW.Write((uint)0x70); // header_size
        dexW.Write((uint)0x12345678); // endian_tag
        dexW.Write((uint)0); // link_size
        dexW.Write((uint)0); // link_off
        dexW.Write(mapListOff);
        dexW.Write((uint)strings.Count);
        dexW.Write(stringIdsOff);
        dexW.Write((uint)typeDescriptors.Count);
        dexW.Write(typeIdsOff);
        dexW.Write((uint)protos.Count);
        dexW.Write(protoIdsOff);
        dexW.Write((uint)fields.Count);
        dexW.Write(fieldIdsOff);
        dexW.Write((uint)methods.Count);
        dexW.Write(methodIdsOff);
        dexW.Write((uint)1); // class_defs_size
        dexW.Write(classDefsOff);
        dexW.Write((uint)dataBytes.Length);
        dexW.Write(dataOff);

        // string_ids
        foreach (uint sOff in stringDataOffsets) dexW.Write(sOff);
        // type_ids
        foreach (string td in typeDescriptors) dexW.Write((uint)StrIdx(td));
        // proto_ids
        for (int i = 0; i < protos.Count; i++)
        {
            dexW.Write((uint)StrIdx(protos[i].Shorty));
            dexW.Write((uint)TypeIdx(protos[i].ReturnType));
            dexW.Write(protoTypeListOffsets[i]);
        }
        // field_ids
        foreach (var f in fields)
        {
            dexW.Write((ushort)TypeIdx(f.ClassType));
            dexW.Write((ushort)TypeIdx(f.Type));
            dexW.Write((uint)StrIdx(f.Name));
        }
        // method_ids
        foreach (var m in methods)
        {
            dexW.Write((ushort)TypeIdx(m.ClassType));
            dexW.Write((ushort)protos.IndexOf(m.Proto));
            dexW.Write((uint)StrIdx(m.Name));
        }
        // class_defs (MainActivity)
        dexW.Write((uint)TypeIdx("Lcom/cycleworld/b2b/MainActivity;"));
        dexW.Write((uint)0x0001); // ACC_PUBLIC
        dexW.Write((uint)TypeIdx("Landroid/app/Activity;"));
        dexW.Write((uint)0); // interfaces_off
        dexW.Write((uint)0xFFFFFFFFu); // source_file_idx = NO_INDEX
        dexW.Write((uint)0); // annotations_off
        dexW.Write(classDataOff);
        dexW.Write((uint)0); // static_values_off

        // data section
        dexW.Write(dataBytes);

        byte[] dexBytes = dexMs.ToArray();

        // Compute SHA-1 over bytes [32..end]
        using (SHA1 sha1 = SHA1.Create())
        {
            byte[] hash = sha1.ComputeHash(dexBytes, 32, dexBytes.Length - 32);
            Array.Copy(hash, 0, dexBytes, 12, 20);
        }

        // Compute Adler32 over bytes [12..end]
        uint adlerA = 1, adlerB = 0;
        for (int i = 12; i < dexBytes.Length; i++)
        {
            adlerA = (adlerA + dexBytes[i]) % 65521;
            adlerB = (adlerB + adlerA) % 65521;
        }
        uint adler = (adlerB << 16) | adlerA;
        byte[] adlerBytes = BitConverter.GetBytes(adler);
        Array.Copy(adlerBytes, 0, dexBytes, 8, 4);

        return dexBytes;
    }

    // =========================================================================
    // 5. SELF-SIGNED CERTIFICATE + V1 & V2 APK CRYPTOGRAPHIC SIGNER
    // =========================================================================
    private static byte[] EncodeDerLength(int len)
    {
        if (len < 128) return new byte[] { (byte)len };
        if (len < 256) return new byte[] { 0x81, (byte)len };
        return new byte[] { 0x82, (byte)(len >> 8), (byte)(len & 0xFF) };
    }

    private static byte[] DerWrap(byte tag, params byte[][] children)
    {
        int total = 0;
        foreach (var c in children) total += c.Length;
        byte[] lenBytes = EncodeDerLength(total);
        byte[] res = new byte[1 + lenBytes.Length + total];
        res[0] = tag;
        Array.Copy(lenBytes, 0, res, 1, lenBytes.Length);
        int pos = 1 + lenBytes.Length;
        foreach (var c in children)
        {
            Array.Copy(c, 0, res, pos, c.Length);
            pos += c.Length;
        }
        return res;
    }

    private static byte[] DerInteger(byte[] bigEndianUnsigned)
    {
        int start = 0;
        while (start < bigEndianUnsigned.Length - 1 && bigEndianUnsigned[start] == 0) start++;
        int len = bigEndianUnsigned.Length - start;
        bool padZero = (bigEndianUnsigned[start] & 0x80) != 0;
        byte[] payload = new byte[len + (padZero ? 1 : 0)];
        Array.Copy(bigEndianUnsigned, start, payload, padZero ? 1 : 0, len);
        return DerWrap(0x02, payload);
    }

    private static byte[] ExportSubjectPublicKeyInfo(RSAParameters p)
    {
        byte[] rsaPubKey = DerWrap(0x30, DerInteger(p.Modulus), DerInteger(p.Exponent));
        byte[] bitStringPayload = new byte[rsaPubKey.Length + 1];
        bitStringPayload[0] = 0x00;
        Array.Copy(rsaPubKey, 0, bitStringPayload, 1, rsaPubKey.Length);
        byte[] bitString = DerWrap(0x03, bitStringPayload);
        // rsaEncryption OID: 1.2.840.113549.1.1.1 + NULL
        byte[] algId = new byte[] { 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00 };
        return DerWrap(0x30, algId, bitString);
    }

    private static void CreateApkCertAndPkcs7(RSACryptoServiceProvider rsa, byte[] certSfBytes, out byte[] certDer, out byte[] certRsaBytes)
    {
        RSAParameters p = rsa.ExportParameters(false);
        byte[] spki = ExportSubjectPublicKeyInfo(p);

        // X.509 v3 TBSCertificate
        byte[] version = new byte[] { 0xa0, 0x03, 0x02, 0x01, 0x02 };
        byte[] serial = new byte[] { 0x02, 0x04, 0x20, 0x26, 0x10, 0x07 };
        // sha256WithRSAEncryption: 1.2.840.113549.1.1.11
        byte[] sigAlg = new byte[] { 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b, 0x05, 0x00 };

        // CN=Cycle World B2B
        byte[] cnOid = new byte[] { 0x06, 0x03, 0x55, 0x04, 0x03 };
        byte[] cnVal = DerWrap(0x0c, Encoding.UTF8.GetBytes("Cycle World B2B"));
        byte[] name = DerWrap(0x30, DerWrap(0x31, DerWrap(0x30, cnOid, cnVal)));

        byte[] notBefore = DerWrap(0x17, Encoding.ASCII.GetBytes("240101000000Z"));
        byte[] notAfter  = DerWrap(0x17, Encoding.ASCII.GetBytes("491231235959Z"));
        byte[] validity  = DerWrap(0x30, notBefore, notAfter);

        byte[] tbs = DerWrap(0x30, version, serial, sigAlg, name, validity, name, spki);
        byte[] sig = rsa.SignData(tbs, CryptoConfig.MapNameToOID("SHA256"));
        byte[] sigBitStringPayload = new byte[sig.Length + 1];
        Array.Copy(sig, 0, sigBitStringPayload, 1, sig.Length);
        certDer = DerWrap(0x30, tbs, sigAlg, DerWrap(0x03, sigBitStringPayload));

        // Build PKCS#7 SignedData (META-INF/CERT.RSA) signing certSfBytes directly
        byte[] sha256AlgId = new byte[] { 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00 };
        byte[] rsaEncAlgId = new byte[] { 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00 };
        byte[] pkcs7DataOid = new byte[] { 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x01 };
        byte[] pkcs7SignedDataOid = new byte[] { 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02 };

        byte[] sfSignature = rsa.SignData(certSfBytes, CryptoConfig.MapNameToOID("SHA256"));
        byte[] signerInfo = DerWrap(
            0x30,
            new byte[] { 0x02, 0x01, 0x01 }, // version 1
            DerWrap(0x30, name, serial),     // IssuerAndSerialNumber
            sha256AlgId,
            rsaEncAlgId,
            DerWrap(0x04, sfSignature)
        );

        byte[] signedData = DerWrap(
            0x30,
            new byte[] { 0x02, 0x01, 0x01 }, // version 1
            DerWrap(0x31, sha256AlgId),      // digestAlgorithms
            DerWrap(0x30, pkcs7DataOid),     // encapContentInfo (id-data)
            DerWrap(0xa0, certDer),          // certificates [0] IMPLICIT
            DerWrap(0x31, signerInfo)        // signerInfos
        );

        certRsaBytes = DerWrap(0x30, pkcs7SignedDataOid, DerWrap(0xa0, signedData));
    }

    // Build APK Signature Scheme v2 Block ("APK Sig Block 42")
    private static byte[] ComputeApkV2ContentDigest(byte[][] sections)
    {
        // 1 MB (1048576 bytes) chunks across the 3 ZIP sections
        List<byte[]> chunkDigests = new List<byte[]>();
        using (SHA256 sha = SHA256.Create())
        {
            foreach (byte[] sec in sections)
            {
                int offset = 0;
                while (offset < sec.Length)
                {
                    int chunkLen = Math.Min(1048576, sec.Length - offset);
                    byte[] chunkBuf = new byte[5 + chunkLen];
                    chunkBuf[0] = 0xa5;
                    Array.Copy(BitConverter.GetBytes((uint)chunkLen), 0, chunkBuf, 1, 4);
                    Array.Copy(sec, offset, chunkBuf, 5, chunkLen);
                    chunkDigests.Add(sha.ComputeHash(chunkBuf));
                    offset += chunkLen;
                }
            }

            byte[] topInput = new byte[5 + chunkDigests.Count * 32];
            topInput[0] = 0x5a;
            Array.Copy(BitConverter.GetBytes((uint)chunkDigests.Count), 0, topInput, 1, 4);
            for (int i = 0; i < chunkDigests.Count; i++)
            {
                Array.Copy(chunkDigests[i], 0, topInput, 5 + i * 32, 32);
            }
            return sha.ComputeHash(topInput);
        }
    }

    private static byte[] LengthPrefixed(byte[] data)
    {
        byte[] res = new byte[4 + data.Length];
        Array.Copy(BitConverter.GetBytes((uint)data.Length), 0, res, 0, 4);
        Array.Copy(data, 0, res, 4, data.Length);
        return res;
    }

    private static byte[] BuildApkSignatureBlockV2(byte[] beforeCd, byte[] cd, byte[] eocd, RSACryptoServiceProvider rsa, byte[] certDer, byte[] spkiDer)
    {
        byte[] digest = ComputeApkV2ContentDigest(new byte[][] { beforeCd, cd, eocd });

        // signature algorithm: 0x0103 = RSA_PKCS1_V1_5_WITH_SHA256
        uint algId = 0x0103u;
        byte[] digestEntry = LengthPrefixed(
            Combine(BitConverter.GetBytes(algId), LengthPrefixed(digest))
        );
        byte[] digestsSeq = LengthPrefixed(digestEntry);
        byte[] certsSeq = LengthPrefixed(LengthPrefixed(certDer));
        byte[] attrsSeq = LengthPrefixed(new byte[0]);
        // Android v2 signed data has an extra 4-byte padding/empty field Only in v3, in v2 it's strictly:
        // digests + certificates + additional_attributes
        byte[] signedData = Combine(digestsSeq, certsSeq, attrsSeq);

        byte[] sigBytes = rsa.SignData(signedData, CryptoConfig.MapNameToOID("SHA256"));
        byte[] sigEntry = LengthPrefixed(
            Combine(BitConverter.GetBytes(algId), LengthPrefixed(sigBytes))
        );
        byte[] signaturesSeq = LengthPrefixed(sigEntry);

        byte[] signer = Combine(
            LengthPrefixed(signedData),
            signaturesSeq,
            LengthPrefixed(spkiDer)
        );
        byte[] signersBlock = LengthPrefixed(LengthPrefixed(signer));

        // ID-value pair: uint64len + uint32id (0x7109871a) + signersBlock
        ulong pairLen = (ulong)(4 + signersBlock.Length);
        MemoryStream pairMs = new MemoryStream();
        BinaryWriter pw = new BinaryWriter(pairMs);
        pw.Write(pairLen);
        pw.Write((uint)0x7109871au);
        pw.Write(signersBlock);
        // Pad so total block is multiple of 8 bytes if needed
        byte[] pairsBytes = pairMs.ToArray();

        // Block size field (excluding the initial uint64 size field itself):
        // pairsBytes.Length + 8 (second size field) + 16 ("APK Sig Block 42")
        ulong blockSize = (ulong)(pairsBytes.Length + 24);
        MemoryStream blockMs = new MemoryStream();
        BinaryWriter bw = new BinaryWriter(blockMs);
        bw.Write(blockSize);
        bw.Write(pairsBytes);
        bw.Write(blockSize);
        bw.Write(Encoding.ASCII.GetBytes("APK Sig Block 42"));
        return blockMs.ToArray();
    }

    private static byte[] Combine(params byte[][] arrays)
    {
        int len = 0;
        foreach (var a in arrays) len += a.Length;
        byte[] res = new byte[len];
        int pos = 0;
        foreach (var a in arrays)
        {
            Array.Copy(a, 0, res, pos, a.Length);
            pos += a.Length;
        }
        return res;
    }

    // =========================================================================
    // 6. FULL APK PACKAGER (4-BYTE ALIGNED ZIP + V1 + V2 SIGNING)
    // =========================================================================
    private class ApkEntry
    {
        public string Name;
        public byte[] RawBytes;
        public bool StoreUncompressed;
    }

    private static uint ComputeCrc32(byte[] data)
    {
        uint crc = 0xFFFFFFFFu;
        for (int i = 0; i < data.Length; i++)
        {
            crc ^= data[i];
            for (int j = 0; j < 8; j++)
            {
                if ((crc & 1) != 0) crc = (crc >> 1) ^ 0xEDB88320u;
                else crc >>= 1;
            }
        }
        return ~crc;
    }

    public static void BuildSignedApk(string rootDir, string outputApkPath)
    {
        var entries = new List<ApkEntry>();

        // 1. Core Android binary files
        byte[] manifestBytes = BuildBinaryAndroidManifest();
        byte[] arscBytes = BuildResourcesArsc();
        byte[] iconBytes = BuildLauncherIconPng();
        byte[] dexBytes = BuildClassesDex();

        entries.Add(new ApkEntry { Name = "AndroidManifest.xml", RawBytes = manifestBytes, StoreUncompressed = false });
        entries.Add(new ApkEntry { Name = "resources.arsc", RawBytes = arscBytes, StoreUncompressed = true });
        entries.Add(new ApkEntry { Name = "res/drawable/ic_launcher.png", RawBytes = iconBytes, StoreUncompressed = true });
        entries.Add(new ApkEntry { Name = "classes.dex", RawBytes = dexBytes, StoreUncompressed = false });

        // 2. Bundle web application assets under assets/www/
        string[] webFiles = new string[]
        {
            "index.html",
            "admin.html",
            "customer.html",
            "billing.html",
            "css/styles.css",
            "js/preloaded-db.js",
            "js/database-engine.js",
            "js/file-import.js",
            "js/app.js",
            "database/cycleworld_db.json"
        };

        foreach (string rel in webFiles)
        {
            string full = Path.Combine(rootDir, rel.Replace('/', Path.DirectorySeparatorChar));
            if (File.Exists(full))
            {
                entries.Add(new ApkEntry
                {
                    Name = "assets/www/" + rel,
                    RawBytes = File.ReadAllBytes(full),
                    StoreUncompressed = false
                });
            }
        }

        // Include assets folder (logos/icons)
        string assetsDir = Path.Combine(rootDir, "assets");
        if (Directory.Exists(assetsDir))
        {
            foreach (string f in Directory.GetFiles(assetsDir, "*", SearchOption.AllDirectories))
            {
                string sub = f.Substring(rootDir.Length).TrimStart('\\', '/').Replace('\\', '/');
                entries.Add(new ApkEntry
                {
                    Name = "assets/www/" + sub,
                    RawBytes = File.ReadAllBytes(f),
                    StoreUncompressed = sub.EndsWith(".png", StringComparison.OrdinalIgnoreCase)
                });
            }
        }

        // 3. Create RSA-2048 signing key & X.509 Certificate + META-INF v1 files
        CspParameters csp = new CspParameters();
        csp.ProviderType = 24; // PROV_RSA_AES (supports SHA-256 signing)
        using (RSACryptoServiceProvider rsa = new RSACryptoServiceProvider(2048, csp))
        using (SHA256 sha256 = SHA256.Create())
        {
            byte[] spkiDer = ExportSubjectPublicKeyInfo(rsa.ExportParameters(false));

            StringBuilder mfSb = new StringBuilder();
            mfSb.Append("Manifest-Version: 1.0\r\n");
            mfSb.Append("Created-By: 1.0 (Cycle World B2B Android Builder)\r\n\r\n");

            var entrySecStrings = new List<string>();
            foreach (var e in entries)
            {
                string b64 = Convert.ToBase64String(sha256.ComputeHash(e.RawBytes));
                string sec = "Name: " + e.Name + "\r\nSHA-256-Digest: " + b64 + "\r\n\r\n";
                mfSb.Append(sec);
                entrySecStrings.Add(sec);
            }
            byte[] manifestMfBytes = Encoding.UTF8.GetBytes(mfSb.ToString());

            StringBuilder sfSb = new StringBuilder();
            sfSb.Append("Signature-Version: 1.0\r\n");
            sfSb.Append("Created-By: 1.0 (Cycle World B2B Android Builder)\r\n");
            sfSb.Append("SHA-256-Digest-Manifest: " + Convert.ToBase64String(sha256.ComputeHash(manifestMfBytes)) + "\r\n\r\n");
            for (int i = 0; i < entries.Count; i++)
            {
                string secDigest = Convert.ToBase64String(sha256.ComputeHash(Encoding.UTF8.GetBytes(entrySecStrings[i])));
                sfSb.Append("Name: " + entries[i].Name + "\r\nSHA-256-Digest: " + secDigest + "\r\n\r\n");
            }
            byte[] certSfBytes = Encoding.UTF8.GetBytes(sfSb.ToString());

            byte[] certDer;
            byte[] certRsaBytes;
            CreateApkCertAndPkcs7(rsa, certSfBytes, out certDer, out certRsaBytes);

            entries.Add(new ApkEntry { Name = "META-INF/MANIFEST.MF", RawBytes = manifestMfBytes, StoreUncompressed = false });
            entries.Add(new ApkEntry { Name = "META-INF/CERT.SF", RawBytes = certSfBytes, StoreUncompressed = false });
            entries.Add(new ApkEntry { Name = "META-INF/CERT.RSA", RawBytes = certRsaBytes, StoreUncompressed = false });

            // 4. Write ZIP local file entries with 4-byte alignment (zipalign) for uncompressed entries
            MemoryStream localEntriesMs = new MemoryStream();
            BinaryWriter lw = new BinaryWriter(localEntriesMs);
            MemoryStream cdMs = new MemoryStream();
            BinaryWriter cdw = new BinaryWriter(cdMs);

            foreach (var e in entries)
            {
                byte[] nameUtf8 = Encoding.UTF8.GetBytes(e.Name);
                uint crc = ComputeCrc32(e.RawBytes);
                ushort method = 0;
                byte[] storedPayload = e.RawBytes;

                if (!e.StoreUncompressed)
                {
                    using (MemoryStream cmpMs = new MemoryStream())
                    {
                        using (DeflateStream ds = new DeflateStream(cmpMs, CompressionMode.Compress, true))
                        {
                            ds.Write(e.RawBytes, 0, e.RawBytes.Length);
                        }
                        if (cmpMs.Length < e.RawBytes.Length)
                        {
                            storedPayload = cmpMs.ToArray();
                            method = 8; // Deflate
                        }
                    }
                }

                uint localHeaderOffset = (uint)localEntriesMs.Position;
                ushort extraLen = 0;
                if (method == 0)
                {
                    // Align data start to 4-byte boundary (zipalign)
                    uint dataStart = localHeaderOffset + 30u + (uint)nameUtf8.Length;
                    uint rem = dataStart % 4u;
                    if (rem != 0) extraLen = (ushort)(4u - rem);
                }

                // Local File Header (30 bytes + name + extra)
                lw.Write((uint)0x04034b50u);
                lw.Write((ushort)20); // version needed
                lw.Write((ushort)0);  // flags
                lw.Write(method);
                lw.Write((ushort)0x0000); // mod time
                lw.Write((ushort)0x5547); // mod date
                lw.Write(crc);
                lw.Write((uint)storedPayload.Length);
                lw.Write((uint)e.RawBytes.Length);
                lw.Write((ushort)nameUtf8.Length);
                lw.Write(extraLen);
                lw.Write(nameUtf8);
                if (extraLen > 0) lw.Write(new byte[extraLen]);
                lw.Write(storedPayload);

                // Central Directory File Header (46 bytes + name)
                cdw.Write((uint)0x02014b50u);
                cdw.Write((ushort)20); // version made by
                cdw.Write((ushort)20); // version needed
                cdw.Write((ushort)0);  // flags
                cdw.Write(method);
                cdw.Write((ushort)0x0000);
                cdw.Write((ushort)0x5547);
                cdw.Write(crc);
                cdw.Write((uint)storedPayload.Length);
                cdw.Write((uint)e.RawBytes.Length);
                cdw.Write((ushort)nameUtf8.Length);
                cdw.Write((ushort)0); // extra len in CD
                cdw.Write((ushort)0); // comment len
                cdw.Write((ushort)0); // disk number
                cdw.Write((ushort)0); // internal attrs
                cdw.Write((uint)0);   // external attrs
                cdw.Write(localHeaderOffset);
                cdw.Write(nameUtf8);
            }

            // Pad localEntriesMs to 4096-byte multiple before APK Signing Block if desired, or 4-byte multiple
            while (localEntriesMs.Position % 4 != 0) lw.Write((byte)0);

            byte[] beforeCd = localEntriesMs.ToArray();
            byte[] cdBytes = cdMs.ToArray();

            // EOCD with original CD offset (used during v2 digest calculation per Android spec!)
            MemoryStream eocdOrigMs = new MemoryStream();
            BinaryWriter eow = new BinaryWriter(eocdOrigMs);
            eow.Write((uint)0x06054b50u);
            eow.Write((ushort)0);
            eow.Write((ushort)0);
            eow.Write((ushort)entries.Count);
            eow.Write((ushort)entries.Count);
            eow.Write((uint)cdBytes.Length);
            eow.Write((uint)beforeCd.Length); // original CD offset before inserting APK Sig Block
            eow.Write((ushort)0);
            byte[] eocdOrigBytes = eocdOrigMs.ToArray();

            // Compute APK Signature Scheme v2 Block
            byte[] v2SigBlock = BuildApkSignatureBlockV2(beforeCd, cdBytes, eocdOrigBytes, rsa, certDer, spkiDer);

            // Final EOCD with updated Central Directory offset = beforeCd.Length + v2SigBlock.Length
            MemoryStream eocdFinalMs = new MemoryStream();
            BinaryWriter efw = new BinaryWriter(eocdFinalMs);
            efw.Write((uint)0x06054b50u);
            efw.Write((ushort)0);
            efw.Write((ushort)0);
            efw.Write((ushort)entries.Count);
            efw.Write((ushort)entries.Count);
            efw.Write((uint)cdBytes.Length);
            efw.Write((uint)(beforeCd.Length + v2SigBlock.Length));
            efw.Write((ushort)0);
            byte[] eocdFinalBytes = eocdFinalMs.ToArray();

            using (FileStream fs = new FileStream(outputApkPath, FileMode.Create, FileAccess.Write))
            {
                fs.Write(beforeCd, 0, beforeCd.Length);
                fs.Write(v2SigBlock, 0, v2SigBlock.Length);
                fs.Write(cdBytes, 0, cdBytes.Length);
                fs.Write(eocdFinalBytes, 0, eocdFinalBytes.Length);
            }
        }
    }
}
"@

Write-Host "Building signed Android APK: $apkOutputPath ..." -ForegroundColor Cyan
[CycleWorldApkBuilder]::BuildSignedApk($rootDir, $apkOutputPath)
$apkInfo = Get-Item $apkOutputPath
Write-Host "SUCCESS! Created signed Android APK: $($apkInfo.FullName) ($([Math]::Round($apkInfo.Length / 1MB, 2)) MB)" -ForegroundColor Green
