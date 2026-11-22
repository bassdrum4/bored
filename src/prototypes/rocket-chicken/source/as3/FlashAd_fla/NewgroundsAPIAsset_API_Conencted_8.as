package FlashAd_fla
{
   import com.newgrounds.components.APIConnector;
   import flash.display.MovieClip;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol121")]
   public dynamic class NewgroundsAPIAsset_API_Conencted_8 extends MovieClip
   {
      
      public function NewgroundsAPIAsset_API_Conencted_8()
      {
         super();
         addFrameScript(36,this.frame37);
      }
      
      internal function frame37() : *
      {
         APIConnector(parent).clear();
      }
   }
}

