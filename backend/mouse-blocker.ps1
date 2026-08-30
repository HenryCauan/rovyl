Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @"
using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

public static class ZenithRadialMouseBlocker {
    private const int WH_MOUSE_LL = 14;
    private const int WM_LBUTTONDOWN = 0x0201;
    private const int WM_LBUTTONUP = 0x0202;
    private const int WM_LBUTTONDBLCLK = 0x0203;
    private const int WM_RBUTTONDOWN = 0x0204;
    private const int WM_RBUTTONUP = 0x0205;
    private const int WM_RBUTTONDBLCLK = 0x0206;
    private const int WM_MBUTTONDOWN = 0x0207;
    private const int WM_MBUTTONUP = 0x0208;
    private const int WM_MBUTTONDBLCLK = 0x0209;
    private const int WM_MOUSEWHEEL = 0x020A;
    private const int WM_XBUTTONDOWN = 0x020B;
    private const int WM_XBUTTONUP = 0x020C;
    private const int WM_XBUTTONDBLCLK = 0x020D;
    private const int WM_MOUSEHWHEEL = 0x020E;

    private const int MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    private const int MOUSEEVENTF_MIDDLEUP = 0x0040;
    private const int MOUSEEVENTF_XDOWN = 0x0080;
    private const int MOUSEEVENTF_XUP = 0x0100;

    /** Assinatura dos eventos que nos proprios injetamos, para o hook nao os voltar a engolir. */
    private const uint SYNTHETIC_TAG = 0x524F5659;

    private delegate IntPtr LowLevelMouseProc(int nCode, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int x; public int y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSLLHOOKSTRUCT {
        public POINT pt;
        public uint mouseData;
        public uint flags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT {
        public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public UIntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT { public uint type; public MOUSEINPUT mi; }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelMouseProc callback, IntPtr module, uint threadId);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hook, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string moduleName);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint count, INPUT[] inputs, int size);

    private static readonly ConcurrentQueue<string> Commands = new ConcurrentQueue<string>();
    private static readonly ConcurrentQueue<int> Passthroughs = new ConcurrentQueue<int>();
    private static readonly LowLevelMouseProc Callback = HookCallback;
    private static readonly object WriteLock = new object();
    private static IntPtr Hook = IntPtr.Zero;
    private static volatile bool Blocking;
    private static int Left, Top, Right, Bottom;
    private static int MonitorLeft, MonitorTop, MonitorRight, MonitorBottom;

    /**
     * Captura do botao de disparo.
     *
     * O detetor era um poller de `GetAsyncKeyState` noutro processo, que so OBSERVAVA o botao. O
     * evento seguia intacto para a janela por baixo e, em qualquer superficie com scroll, o
     * Windows entrava em autoscroll: mirar na roda arrastava a pagina atras dela.
     *
     * Um hook que devolve 1 engole o evento -- mas isso tambem esconde o botao do
     * `GetAsyncKeyState`, portanto quem engole tem de ser tambem quem deteta.
     */
    private static volatile int TriggerButton;      // 0 = desligado, 4 = meio, 5 = X1, 6 = X2
    private static volatile bool TriggerHoldMode;   // no modo "click" nunca ha clique a devolver
    private static volatile int TriggerThreshold;   // px; abaixo disto o gesto nao mirou nada
    private static int DownX, DownY;
    private static long DownAt;

    /** Uma pressao mais longa que isto foi intencao de abrir a roda, nao um clique. */
    private const long PASSTHROUGH_MAX_MS = 250;

    private static void Emit(string line) {
        lock (WriteLock) { Console.WriteLine(line); Console.Out.Flush(); }
    }

    private static bool IsBlockedMessage(int message) {
        return message == WM_LBUTTONDOWN || message == WM_LBUTTONUP || message == WM_LBUTTONDBLCLK ||
               message == WM_RBUTTONDOWN || message == WM_RBUTTONUP || message == WM_RBUTTONDBLCLK ||
               message == WM_MBUTTONDOWN || message == WM_MBUTTONUP || message == WM_MBUTTONDBLCLK ||
               message == WM_XBUTTONDOWN || message == WM_XBUTTONUP || message == WM_XBUTTONDBLCLK ||
               message == WM_MOUSEWHEEL || message == WM_MOUSEHWHEEL;
    }

    /** Qual botao de disparo esta mensagem representa, se algum. 0 = nenhum. */
    private static int TriggerFor(int message, uint mouseData, out bool isDown) {
        isDown = false;
        if (message == WM_MBUTTONDOWN || message == WM_MBUTTONUP || message == WM_MBUTTONDBLCLK) {
            isDown = (message != WM_MBUTTONUP);
            return 4;
        }
        if (message == WM_XBUTTONDOWN || message == WM_XBUTTONUP || message == WM_XBUTTONDBLCLK) {
            isDown = (message != WM_XBUTTONUP);
            int which = (int)((mouseData >> 16) & 0xFFFF);
            return which == 2 ? 6 : 5;
        }
        return 0;
    }

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode < 0) return CallNextHookEx(Hook, nCode, wParam, lParam);

        var data = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));

        /** Os nossos proprios cliques devolvidos passam sem serem reinterpretados. */
        if ((uint)data.dwExtraInfo.ToUInt64() == SYNTHETIC_TAG) {
            return CallNextHookEx(Hook, nCode, wParam, lParam);
        }

        int message = wParam.ToInt32();
        int trigger = TriggerButton;

        if (trigger != 0) {
            bool isDown;
            int which = TriggerFor(message, data.mouseData, out isDown);
            if (which == trigger) {
                if (isDown) {
                    DownX = data.pt.x;
                    DownY = data.pt.y;
                    DownAt = Environment.TickCount;
                    Emit("TRIGGER_DOWN");
                } else {
                    Emit("TRIGGER_UP");
                    /**
                     * Clique curto e parado: o utilizador nao mirou nada, quis mesmo clicar com o
                     * botao do meio. Devolvemos o clique a janela por baixo -- mas fora do hook,
                     * porque injetar aqui reentraria nele.
                     */
                    int dx = data.pt.x - DownX;
                    int dy = data.pt.y - DownY;
                    long held = Environment.TickCount - DownAt;
                    int threshold = TriggerThreshold;
                    if (TriggerHoldMode && held <= PASSTHROUGH_MAX_MS &&
                        (dx * dx + dy * dy) <= threshold * threshold) {
                        Passthroughs.Enqueue(trigger);
                    }
                }
                return new IntPtr(1);
            }
        }

        if (Blocking && IsBlockedMessage(message)) {
            bool insideAllowed = data.pt.x >= Left && data.pt.x < Right && data.pt.y >= Top && data.pt.y < Bottom;
            bool insideMonitor = data.pt.x >= MonitorLeft && data.pt.x < MonitorRight &&
                                 data.pt.y >= MonitorTop && data.pt.y < MonitorBottom;
            if (insideMonitor && !insideAllowed) return new IntPtr(1);
        }

        return CallNextHookEx(Hook, nCode, wParam, lParam);
    }

    /** Injeta o clique que engolimos, marcado para o hook o deixar passar. */
    private static void SendPassthrough(int trigger) {
        uint downFlag, upFlag, data;
        if (trigger == 4) { downFlag = MOUSEEVENTF_MIDDLEDOWN; upFlag = MOUSEEVENTF_MIDDLEUP; data = 0; }
        else { downFlag = MOUSEEVENTF_XDOWN; upFlag = MOUSEEVENTF_XUP; data = (uint)(trigger == 6 ? 2 : 1); }

        var inputs = new INPUT[2];
        inputs[0].type = 0;
        inputs[0].mi = new MOUSEINPUT { dwFlags = downFlag, mouseData = data, dwExtraInfo = new UIntPtr(SYNTHETIC_TAG) };
        inputs[1].type = 0;
        inputs[1].mi = new MOUSEINPUT { dwFlags = upFlag, mouseData = data, dwExtraInfo = new UIntPtr(SYNTHETIC_TAG) };
        SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    private static void InstallHook() {
        if (Hook != IntPtr.Zero) return;
        using (var process = Process.GetCurrentProcess())
        using (var module = process.MainModule) {
            Hook = SetWindowsHookEx(WH_MOUSE_LL, Callback, GetModuleHandle(module.ModuleName), 0);
        }
    }

    /** O hook fica enquanto houver motivo: bloqueio do radial OU captura do botao de disparo. */
    private static void ReleaseHookIfIdle() {
        if (Blocking || TriggerButton != 0) return;
        if (Hook != IntPtr.Zero) {
            UnhookWindowsHookEx(Hook);
            Hook = IntPtr.Zero;
        }
    }

    private static void DisableBlocking() {
        Blocking = false;
        ReleaseHookIfIdle();
    }

    private static void Apply(string command, ApplicationContext context) {
        var parts = command.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0) return;

        if (parts.Length == 9 && parts[0] == "BLOCK") {
            int x, y, width, height, monitorX, monitorY, monitorWidth, monitorHeight;
            if (int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out x) &&
                int.TryParse(parts[2], NumberStyles.Integer, CultureInfo.InvariantCulture, out y) &&
                int.TryParse(parts[3], NumberStyles.Integer, CultureInfo.InvariantCulture, out width) &&
                int.TryParse(parts[4], NumberStyles.Integer, CultureInfo.InvariantCulture, out height) &&
                int.TryParse(parts[5], NumberStyles.Integer, CultureInfo.InvariantCulture, out monitorX) &&
                int.TryParse(parts[6], NumberStyles.Integer, CultureInfo.InvariantCulture, out monitorY) &&
                int.TryParse(parts[7], NumberStyles.Integer, CultureInfo.InvariantCulture, out monitorWidth) &&
                int.TryParse(parts[8], NumberStyles.Integer, CultureInfo.InvariantCulture, out monitorHeight)) {
                Left = x; Top = y; Right = x + width; Bottom = y + height;
                MonitorLeft = monitorX; MonitorTop = monitorY;
                MonitorRight = monitorX + monitorWidth; MonitorBottom = monitorY + monitorHeight;
                InstallHook();
                Blocking = Hook != IntPtr.Zero;
            }
        } else if (parts[0] == "UNBLOCK") {
            DisableBlocking();
        } else if (parts[0] == "TRIGGER") {
            // TRIGGER <vk 4|5|6> <hold|click> <threshold px>   |   TRIGGER OFF
            if (parts.Length >= 2 && parts[1] == "OFF") {
                TriggerButton = 0;
                ReleaseHookIfIdle();
                Emit("TRIGGER_OFF");
                return;
            }
            int vk, threshold;
            if (parts.Length == 4 &&
                int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out vk) &&
                int.TryParse(parts[3], NumberStyles.Integer, CultureInfo.InvariantCulture, out threshold)) {
                if (vk != 4 && vk != 5 && vk != 6) vk = 4;
                TriggerHoldMode = parts[2] != "click";
                TriggerThreshold = threshold > 0 ? threshold : 0;
                InstallHook();
                TriggerButton = Hook != IntPtr.Zero ? vk : 0;
                Emit(TriggerButton != 0 ? "TRIGGER_READY" : "TRIGGER_FAILED");
            }
        } else if (parts[0] == "EXIT") {
            TriggerButton = 0;
            DisableBlocking();
            context.ExitThread();
        }
    }

    public static void Run(int parentPid) {
        var context = new ApplicationContext();
        var input = new Thread(() => {
            string line;
            while ((line = Console.ReadLine()) != null) Commands.Enqueue(line);
            Commands.Enqueue("EXIT");
        });
        input.IsBackground = true;
        input.Start();

        var timer = new System.Windows.Forms.Timer();
        timer.Interval = 15;
        timer.Tick += (sender, args) => {
            try { Process.GetProcessById(parentPid); }
            catch { Commands.Enqueue("EXIT"); }
            string command;
            while (Commands.TryDequeue(out command)) Apply(command, context);
            int passthrough;
            while (Passthroughs.TryDequeue(out passthrough)) SendPassthrough(passthrough);
        };
        timer.Start();
        Emit("READY");
        Application.Run(context);
        timer.Stop();
        TriggerButton = 0;
        DisableBlocking();
    }
}
"@

[ZenithRadialMouseBlocker]::Run([int]$args[0])
