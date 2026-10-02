import { useEffect, useRef, useSyncExternalStore } from 'react';
import { LocalPlanLibraryRepository } from '../repository';
import { BrowserStorageService } from '../storageService';
import { ExpoSketchViewModel } from '../viewModel';

export const useExpoSketchViewModel = (injected?: ExpoSketchViewModel) => {
  const createdRef = useRef<ExpoSketchViewModel | null>(null);
  if (!createdRef.current) createdRef.current = injected ?? new ExpoSketchViewModel(new LocalPlanLibraryRepository(new BrowserStorageService()));
  const vm = createdRef.current;
  const state = useSyncExternalStore(vm.subscribe.bind(vm), () => vm.state, () => vm.state);
  useEffect(() => { if (!injected) void vm.initialize(); }, [vm, injected]);
  return { state, vm };
};
