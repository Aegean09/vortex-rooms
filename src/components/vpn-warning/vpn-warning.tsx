"use client";

import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';

const VPN_WARNING_DISMISSED_KEY = 'vortex-vpn-warning-dismissed';

export function VpnWarning() {
  const [showWarning, setShowWarning] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkVpnStatus = async () => {
      // Check if user already dismissed the warning this session
      try {
        if (sessionStorage.getItem(VPN_WARNING_DISMISSED_KEY) === 'true') {
          setIsChecking(false);
          return;
        }
      } catch {
        // ignore
      }

      try {
        // Try to get WebRTC candidates to detect VPN
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });

        let hasPublicIP = false;
        let candidateTimeout: ReturnType<typeof setTimeout>;

        const checkComplete = () => {
          pc.close();
          setIsChecking(false);
          // If no public IP found within timeout, likely VPN
          if (!hasPublicIP) {
            setShowWarning(true);
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            const candidate = event.candidate.candidate;
            // Check for srflx (server reflexive) candidates - these indicate public IP resolution
            if (candidate.includes('srflx') || candidate.includes('typ srflx')) {
              hasPublicIP = true;
              clearTimeout(candidateTimeout);
              checkComplete();
            }
          }
        };

        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(candidateTimeout);
            checkComplete();
          }
        };

        // Create a data channel to trigger ICE gathering
        pc.createDataChannel('vpn-check');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Timeout after 5 seconds
        candidateTimeout = setTimeout(() => {
          checkComplete();
        }, 5000);
      } catch {
        setIsChecking(false);
      }
    };

    checkVpnStatus();
  }, []);

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(VPN_WARNING_DISMISSED_KEY, 'true');
    } catch {
      // ignore
    }
    setShowWarning(false);
  };

  if (isChecking || !showWarning) {
    return null;
  }

  return (
    <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-full bg-destructive/10">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>
            <AlertDialogTitle>VPN Algılandı</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-left space-y-3">
            <p>
              VPN kullanıyor olabilirsiniz. Bu durumda sesli görüşme bağlantısı 
              kurulamayabilir.
            </p>
            <p className="text-sm text-muted-foreground">
              Vortex, peer-to-peer bağlantı kullanır. VPN'ler genellikle bu tür 
              bağlantıları engeller. En iyi deneyim için VPN'inizi kapatmanızı öneririz.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={handleDismiss}>
            Anladım, Devam Et
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
